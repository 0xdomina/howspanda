import { MedusaError, MedusaService } from "@medusajs/framework/utils"
import Seller from "./models/seller"
import SellerAdmin from "./models/seller-admin"
import CommissionLine from "./models/commission-line"
import Payout from "./models/payout"
import PayoutAccount from "./models/payout-account"

const DEFAULT_RETURN_WINDOW_DAYS = 3
const DEFAULT_FALLBACK_RELEASE_DAYS = 30
const DEFAULT_MIN_PAYOUT_NGN = 5000
const DAY_MS = 24 * 60 * 60 * 1000

export type CurrencyBalance = {
  pending: number
  available: number
  reserved: number
  paid_out: number
}

export type SellerBalances = Record<string, CurrencyBalance>

const round2 = (n: number) => Math.round(n * 100) / 100

class MarketplaceModuleService extends MedusaService({
  Seller,
  SellerAdmin,
  CommissionLine,
  Payout,
  PayoutAccount,
}) {
  returnWindowDays(): number {
    const parsed = Number(process.env.ESCROW_RETURN_WINDOW_DAYS)
    return Number.isFinite(parsed) && parsed >= 0
      ? parsed
      : DEFAULT_RETURN_WINDOW_DAYS
  }

  fallbackReleaseDays(): number {
    const parsed = Number(process.env.ESCROW_FALLBACK_RELEASE_DAYS)
    return Number.isFinite(parsed) && parsed >= 0
      ? parsed
      : DEFAULT_FALLBACK_RELEASE_DAYS
  }

  payoutMinNgn(): number {
    const parsed = Number(process.env.PAYOUT_MIN_NGN)
    return Number.isFinite(parsed) && parsed > 0
      ? parsed
      : DEFAULT_MIN_PAYOUT_NGN
  }

  /**
   * Per-currency settlement balance from the commission ledger. `reversed`
   * lines are excluded; paid-line clawbacks are negated offset lines born
   * `available`, so they net out of the available bucket automatically.
   */
  async getSellerBalance(sellerId: string): Promise<SellerBalances> {
    const lines = await this.listCommissionLines(
      { seller_id: sellerId },
      { take: null }
    )

    const balances: SellerBalances = {}
    for (const line of lines) {
      if (line.status === "reversed") {
        continue
      }
      const currency = line.currency_code
      balances[currency] ??= {
        pending: 0,
        available: 0,
        reserved: 0,
        paid_out: 0,
      }
      const bucket =
        line.status === "paid" ? "paid_out" : (line.status as keyof CurrencyBalance)
      balances[currency][bucket] = round2(
        balances[currency][bucket] + Number(line.net_amount)
      )
    }

    return balances
  }

  /**
   * Lines for a buyer-visible order id: direct match (seller/child order)
   * first, then children of a multi-seller parent.
   */
  async resolveLinesForOrder(orderId: string) {
    const direct = await this.listCommissionLines({ order_id: orderId })
    if (direct.length) {
      return direct
    }
    return await this.listCommissionLines({ parent_order_id: orderId })
  }

  /**
   * Delivery recorded (seller endpoint or core `delivery.created`).
   * Starts the return window. Idempotent — already-delivered lines skip.
   */
  async markOrderDelivered(orderId: string, now: Date = new Date()) {
    const lines = await this.resolveLinesForOrder(orderId)
    const updates = lines
      .filter((line) => line.status === "pending" && !line.delivered_at)
      .map((line) => ({
        id: line.id,
        delivered_at: now,
        release_due_at: new Date(
          now.getTime() + this.returnWindowDays() * DAY_MS
        ),
      }))
    if (updates.length) {
      await this.updateCommissionLines(updates)
    }
    return updates.length
  }

  /**
   * Explicit buyer confirmation — releases IMMEDIATELY (AliExpress model).
   * Held lines are skipped: an open return beats a confirmation.
   */
  async confirmOrderReceipt(orderId: string, now: Date = new Date()) {
    const lines = await this.resolveLinesForOrder(orderId)
    if (!lines.length) {
      throw new MedusaError(
        MedusaError.Types.NOT_FOUND,
        `No commission line found for order ${orderId}`
      )
    }
    const updates = lines
      .filter((line) => line.status === "pending" && !line.held_at)
      .map((line) => ({
        id: line.id,
        delivered_at: line.delivered_at ?? now,
        confirmed_at: now,
        release_due_at: now,
        status: "available" as const,
        available_at: now,
      }))
    if (updates.length) {
      await this.updateCommissionLines(updates)
    }
    return await this.resolveLinesForOrder(orderId)
  }

  /**
   * Buyer return/complaint (or admin hold). Only pending lines can be held —
   * released money is clawed back via reverseCommissionForOrder instead.
   */
  async holdForReturn(orderId: string, reason: string, now: Date = new Date()) {
    const lines = await this.resolveLinesForOrder(orderId)
    if (!lines.length) {
      throw new MedusaError(
        MedusaError.Types.NOT_FOUND,
        `No commission line found for order ${orderId}`
      )
    }
    const eligible = lines.filter((line) => line.status === "pending")
    if (!eligible.length) {
      throw new MedusaError(
        MedusaError.Types.CONFLICT,
        `Escrow for order ${orderId} was already released — use the admin reversal flow`
      )
    }
    const toHold = eligible.filter((line) => !line.held_at)
    if (toHold.length) {
      await this.updateCommissionLines(
        toHold.map((line) => ({
          id: line.id,
          held_at: now,
          hold_reason: reason,
        }))
      )
    }
    return await this.resolveLinesForOrder(orderId)
  }

  /**
   * Hold lifted (buyer cancelled the return / admin resolved the dispute).
   * With releaseNow the funds go available immediately; otherwise the
   * original release_due_at resumes (cron releases it if already past).
   */
  async liftHold(
    orderId: string,
    opts: { releaseNow?: boolean } = {},
    now: Date = new Date()
  ) {
    const lines = await this.resolveLinesForOrder(orderId)
    const held = lines.filter(
      (line) => line.status === "pending" && line.held_at
    )
    if (held.length) {
      await this.updateCommissionLines(
        held.map((line) =>
          opts.releaseNow
            ? {
                id: line.id,
                held_at: null,
                hold_reason: null,
                status: "available" as const,
                available_at: now,
                release_due_at: now,
              }
            : { id: line.id, held_at: null, hold_reason: null }
        )
      )
    }
    return await this.resolveLinesForOrder(orderId)
  }

  /**
   * Escrow release sweep (replaces the Phase 5 time-based clearance):
   * 1. return window expired, not held           → available
   * 2. never delivered, older than the fallback
   *    window, not held (courier/buyer ghosted)  → available
   */
  async releaseDueLines(now: Date = new Date()): Promise<number> {
    const due = await this.listCommissionLines(
      { status: "pending", held_at: null, release_due_at: { $lte: now } },
      { take: null }
    )
    const fallbackCutoff = new Date(
      now.getTime() - this.fallbackReleaseDays() * DAY_MS
    )
    const stale = await this.listCommissionLines(
      {
        status: "pending",
        held_at: null,
        delivered_at: null,
        created_at: { $lte: fallbackCutoff },
      },
      { take: null }
    )
    const seen = new Set(due.map((line) => line.id))
    const all = [...due, ...stale.filter((line) => !seen.has(line.id))]
    if (!all.length) {
      return 0
    }
    await this.updateCommissionLines(
      all.map((line) => ({
        id: line.id,
        status: "available" as const,
        available_at: now,
      }))
    )
    return all.length
  }

  /**
   * Refund/chargeback reversal for one seller order's commission line.
   * - pending/available → `reversed` (drops out of balances)
   * - reserved          → CONFLICT: a payout is in flight, reconcile first
   * - paid              → clawback: negated offset line (order_id
   *                       "<order_id>:reversal") born `available`
   * - reversed          → idempotent no-op
   */
  async reverseCommissionForOrder(orderId: string, reason: string) {
    const [line] = await this.listCommissionLines({ order_id: orderId })

    if (!line) {
      throw new MedusaError(
        MedusaError.Types.NOT_FOUND,
        `No commission line found for order ${orderId}`
      )
    }

    if (line.status === "reversed") {
      return line
    }

    if (line.status === "reserved") {
      throw new MedusaError(
        MedusaError.Types.CONFLICT,
        `Commission line for order ${orderId} is reserved by in-flight payout ${line.payout_id} — reconcile the payout first`
      )
    }

    if (line.status === "paid") {
      const offsetOrderId = `${orderId}:reversal`
      const [existing] = await this.listCommissionLines({
        order_id: offsetOrderId,
      })
      if (existing) {
        return existing
      }

      return await this.createCommissionLines({
        order_id: offsetOrderId,
        currency_code: line.currency_code,
        order_total: -Number(line.order_total),
        rate: line.rate,
        commission_amount: -Number(line.commission_amount),
        net_amount: -Number(line.net_amount),
        status: "available",
        available_at: new Date(),
        reversal_reason: reason,
        seller_id: line.seller_id,
      })
    }

    // pending | available
    const [updated] = await this.updateCommissionLines([
      { id: line.id, status: "reversed" as const, reversal_reason: reason },
    ])
    return updated
  }

  /**
   * Idempotent payout transitions (webhook + reconcile may race — a repeat
   * of the same verdict is a no-op). Each one moves the payout AND its swept
   * commission lines together so the ledger can never disagree with the row.
   */
  async markPayoutPaid(payoutId: string) {
    const payout = await this.retrievePayout(payoutId)
    if (payout.status === "paid") {
      return payout
    }

    const [updated] = await this.updatePayouts([
      { id: payoutId, status: "paid" as const, paid_at: new Date() },
    ])

    const reserved = await this.listCommissionLines(
      { payout_id: payoutId, status: "reserved" },
      { take: null }
    )
    if (reserved.length) {
      await this.updateCommissionLines(
        reserved.map((line) => ({ id: line.id, status: "paid" as const }))
      )
    }

    return updated
  }

  async markPayoutFailed(payoutId: string, reason: string) {
    const payout = await this.retrievePayout(payoutId)
    if (payout.status === "failed") {
      return payout
    }

    const [updated] = await this.updatePayouts([
      { id: payoutId, status: "failed" as const, failure_reason: reason },
    ])

    // release the swept lines so a later payout can pick them up again
    const reserved = await this.listCommissionLines(
      { payout_id: payoutId, status: "reserved" },
      { take: null }
    )
    if (reserved.length) {
      await this.updateCommissionLines(
        reserved.map((line) => ({
          id: line.id,
          status: "available" as const,
          payout_id: null,
        }))
      )
    }

    return updated
  }

  async markPayoutReversed(payoutId: string) {
    const payout = await this.retrievePayout(payoutId)
    if (payout.status === "reversed") {
      return payout
    }

    const [updated] = await this.updatePayouts([
      { id: payoutId, status: "reversed" as const },
    ])

    // the money bounced back — paid lines return to available for a retry
    const paid = await this.listCommissionLines(
      { payout_id: payoutId, status: "paid" },
      { take: null }
    )
    if (paid.length) {
      await this.updateCommissionLines(
        paid.map((line) => ({
          id: line.id,
          status: "available" as const,
          payout_id: null,
        }))
      )
    }

    return updated
  }
}

export default MarketplaceModuleService

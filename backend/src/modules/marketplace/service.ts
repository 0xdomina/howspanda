import { MedusaError, MedusaService } from "@medusajs/framework/utils"
import Seller from "./models/seller"
import SellerAdmin from "./models/seller-admin"
import CommissionLine from "./models/commission-line"
import Payout from "./models/payout"
import PayoutAccount from "./models/payout-account"

const DEFAULT_CLEARANCE_DAYS = 7

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
  clearanceDays(): number {
    const parsed = Number(process.env.PAYOUT_CLEARANCE_DAYS)
    return Number.isFinite(parsed) && parsed >= 0
      ? parsed
      : DEFAULT_CLEARANCE_DAYS
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
   * Flip `pending` lines older than the clearance window to `available`.
   * Phase 5 placeholder trigger: time since creation. A later phase replaces
   * this with delivery-confirmation + return-window clearance.
   */
  async clearPendingLines(now: Date = new Date()): Promise<number> {
    const cutoff = new Date(
      now.getTime() - this.clearanceDays() * 24 * 60 * 60 * 1000
    )

    const due = await this.listCommissionLines(
      { status: "pending", created_at: { $lte: cutoff } },
      { take: null }
    )

    if (!due.length) {
      return 0
    }

    await this.updateCommissionLines(
      due.map((line) => ({
        id: line.id,
        status: "available" as const,
        available_at: now,
      }))
    )

    return due.length
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
}

export default MarketplaceModuleService

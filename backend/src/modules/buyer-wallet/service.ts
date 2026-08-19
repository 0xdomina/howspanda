import { MedusaError, MedusaService } from "@medusajs/framework/utils"
import Wallet from "./models/wallet"
import WalletLedger from "./models/wallet-ledger"
import BuyerWithdrawal from "./models/buyer-withdrawal"
import BuyerWithdrawalAccount from "./models/buyer-withdrawal-account"

const DEFAULT_MIN_WITHDRAWAL_NGN = 1000
const round2 = (n: number) => Math.round(n * 100) / 100

export type WalletLedgerSource =
  | "campaign"
  | "tip_credit"
  | "tip_sent"
  | "referral"
  | "withdrawal"
  | "adjustment"
  | "mall_prize"
  | "delivery_payout"

export type CreditInput = {
  buyerEmail: string
  amount: number
  source: WalletLedgerSource
  reference?: string | null
  currencyCode?: string
}

/**
 * Buyer wallet: a genuine per-email balance + append-only ledger. It is the
 * single withdrawal surface for every buyer-side reward on the platform
 * (campaigns, tip credit notes, buyer-referrer rewards). The wallet is created
 * lazily on first credit. Withdrawal to a real fiat/crypto rail (Paystack
 * Transfers / Circle) mirrors the seller payout lifecycle: the wallet is
 * debited at request time, handed to the rail, and the balance is credited
 * back only if the rail fails or reverses.
 */
class BuyerWalletModuleService extends MedusaService({
  Wallet,
  WalletLedger,
  BuyerWithdrawal,
  BuyerWithdrawalAccount,
}) {
  /** Get-or-create the wallet for a buyer email. */
  async getOrCreate(buyerEmail: string, currencyCode = "ngn") {
    const email = buyerEmail.trim().toLowerCase()
    const [existing] = await this.listWallets({ buyer_email: email })
    if (existing) {
      return existing
    }
    try {
      return await this.createWallets({
        buyer_email: email,
        currency_code: currencyCode,
        balance: 0,
      })
    } catch {
      // Concurrent first-credit: the buyer_email unique index rejected the
      // second create. Re-read — the other request won the race.
      const [winner] = await this.listWallets({ buyer_email: email })
      if (!winner) {
        throw new MedusaError(
          MedusaError.Types.UNEXPECTED_STATE,
          "Failed to create buyer wallet"
        )
      }
      return winner
    }
  }

  /** Read the current balance (0 if the buyer has no wallet yet). */
  async balance(buyerEmail: string) {
    const email = buyerEmail.trim().toLowerCase()
    const [wallet] = await this.listWallets({ buyer_email: email })
    return wallet ? Number(wallet.balance) : 0
  }

  /**
   * Credit a buyer. Atomically writes the ledger line and increments the
   * balance. Idempotency is the caller's responsibility (e.g. a campaign reward
   * flips to `paid` in the same flow that calls this).
   */
  async credit(input: CreditInput) {
    if (!(Number.isFinite(input.amount) && input.amount > 0)) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "A wallet credit must be a positive number"
      )
    }
    const wallet = await this.getOrCreate(input.buyerEmail, input.currencyCode)
    const amount = round2(input.amount)
    const reference = input.reference?.trim() || null
    if (reference) {
      const [existing] = await this.listWalletLedgers({
        wallet: wallet.id,
        source: input.source,
        reference,
      })
      if (existing) return { wallet, ledger: existing }
    }

    let ledger
    try {
      ;[ledger] = await this.createWalletLedgers([
        {
          wallet: wallet.id,
          amount,
          source: input.source,
          reference,
        },
      ])
    } catch {
      // A retry raced the same idempotency reference. Return the already
      // recorded credit instead of incrementing the wallet twice.
      if (reference) {
        const [existing] = await this.listWalletLedgers({
          wallet: wallet.id,
          source: input.source,
          reference,
        })
        if (existing) return { wallet, ledger: existing }
      }
      throw new MedusaError(MedusaError.Types.UNEXPECTED_STATE, "Wallet credit could not be recorded")
    }

    const manager = (this as any).baseRepository_.getActiveManager() as {
      execute: (sql: string, params?: Array<string | number>) => Promise<Array<Record<string, unknown>>>
    }
    const updatedRows = await manager.execute(
      `UPDATE buyer_wallet SET balance = balance + ?, updated_at = now() WHERE id = ? RETURNING id`,
      [amount, wallet.id]
    )
    if (!updatedRows.length) {
      throw new MedusaError(MedusaError.Types.UNEXPECTED_STATE, "Buyer wallet could not be updated")
    }
    const [updated] = await this.listWallets({ id: wallet.id })
    return { wallet: updated, ledger }
  }

  /**
   * Debit a buyer (e.g. a future withdrawal). Refuses to overdraw — the balance
   * can never go negative through this API. The debit is a single atomic
   * conditional UPDATE on the balance, so two concurrent withdrawals can never
   * both pass a read-then-write check and overdraw.
   */
  async debit(input: CreditInput) {
    if (!(Number.isFinite(input.amount) && input.amount > 0)) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "A wallet debit must be a positive number"
      )
    }
    const email = input.buyerEmail.trim().toLowerCase()
    const amount = round2(input.amount)

    const [wallet] = await this.listWallets({ buyer_email: email })
    if (!wallet) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "Insufficient buyer wallet balance"
      )
    }

    const reference = input.reference?.trim() || null
    if (reference) {
      const [existing] = await this.listWalletLedgers({
        wallet: wallet.id,
        source: input.source,
        reference,
      })
      if (existing) {
        const [fresh] = await this.listWallets({ id: wallet.id })
        return { wallet: fresh, ledger: existing }
      }
    }

    const manager = (this as any).baseRepository_.getActiveManager() as {
      execute: (
        sql: string,
        params?: Array<string | number>
      ) => Promise<Array<Record<string, unknown>>>
    }
    const updated = await manager.execute(
      `UPDATE buyer_wallet
       SET balance = balance - ?, updated_at = now()
       WHERE id = ? AND balance >= ?
       RETURNING id`,
      [amount, wallet.id, amount]
    )
    if (!updated.length) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "Insufficient buyer wallet balance"
      )
    }

    let ledger
    try {
      ;[ledger] = await this.createWalletLedgers([
        {
          wallet: wallet.id,
          amount: -amount,
          source: input.source,
          reference,
        },
      ])
    } catch (error) {
      // A concurrent retry may have recorded the same debit after the
      // conditional balance update. The idempotency index makes the second
      // ledger write fail; restore the balance before returning the winner.
      if (reference) {
        const [existing] = await this.listWalletLedgers({
          wallet: wallet.id,
          source: input.source,
          reference,
        })
        if (existing) {
          await manager.execute(
            `UPDATE buyer_wallet SET balance = balance + ?, updated_at = now() WHERE id = ?`,
            [amount, wallet.id]
          )
          const [fresh] = await this.listWallets({ id: wallet.id })
          return { wallet: fresh, ledger: existing }
        }
      }
      await manager.execute(
        `UPDATE buyer_wallet SET balance = balance + ?, updated_at = now() WHERE id = ?`,
        [amount, wallet.id]
      )
      throw error
    }
    const [fresh] = await this.listWallets({ id: wallet.id })
    return { wallet: fresh, ledger }
  }

  /** Append-only history for a buyer (newest first). */
  async listLedger(buyerEmail: string) {
    const email = buyerEmail.trim().toLowerCase()
    const [wallet] = await this.listWallets({ buyer_email: email })
    if (!wallet) {
      return []
    }
    return await this.listWalletLedgers(
      { wallet: wallet.id },
      { order: { created_at: "DESC" } }
    )
  }

  /** Minimum withdrawal amount, mirroring the seller payout minimum. */
  withdrawalMinNgn(): number {
    const parsed = Number(process.env.WALLET_WITHDRAW_MIN_NGN)
    return Number.isFinite(parsed) && parsed > 0
      ? parsed
      : DEFAULT_MIN_WITHDRAWAL_NGN
  }

  /**
   * Idempotent withdrawal transitions (webhook + reconcile may race — a repeat
   * of the same verdict is a no-op). `failed` and `reversed` credit the amount
   * back into the wallet so the ledger can never disagree with the rows.
   */
  async markBuyerWithdrawalPaid(withdrawalId: string) {
    const withdrawal = await this.retrieveBuyerWithdrawal(withdrawalId)
    if (withdrawal.status === "paid") {
      return withdrawal
    }

    const [updated] = await this.updateBuyerWithdrawals([
      {
        id: withdrawalId,
        status: "paid" as const,
        paid_at: new Date(),
      },
    ])
    return updated
  }

  async markBuyerWithdrawalFailed(withdrawalId: string, reason: string) {
    const withdrawal = await this.retrieveBuyerWithdrawal(withdrawalId, {
      relations: ["wallet"],
    })
    if (withdrawal.status === "failed") {
      return withdrawal
    }

    const [updated] = await this.updateBuyerWithdrawals([
      { id: withdrawalId, status: "failed" as const, failure_reason: reason },
    ])

    if (withdrawal.status !== "paid") {
      await this.credit({
        buyerEmail: withdrawal.wallet.buyer_email,
        amount: Number(withdrawal.amount),
        source: "adjustment",
        reference: withdrawalId,
      })
    }

    return updated
  }

  async markBuyerWithdrawalReversed(withdrawalId: string) {
    const withdrawal = await this.retrieveBuyerWithdrawal(withdrawalId, {
      relations: ["wallet"],
    })
    if (withdrawal.status === "reversed") {
      return withdrawal
    }

    const [updated] = await this.updateBuyerWithdrawals([
      { id: withdrawalId, status: "reversed" as const },
    ])

    await this.credit({
      buyerEmail: withdrawal.wallet.buyer_email,
      amount: Number(withdrawal.amount),
      source: "adjustment",
      reference: withdrawalId,
    })

    return updated
  }
}

export default BuyerWalletModuleService

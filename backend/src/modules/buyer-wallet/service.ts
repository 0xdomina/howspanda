import { MedusaError, MedusaService } from "@medusajs/framework/utils"
import Wallet from "./models/wallet"
import WalletLedger from "./models/wallet-ledger"

const round2 = (n: number) => Math.round(n * 100) / 100

export type WalletLedgerSource =
  | "campaign"
  | "tip_credit"
  | "referral"
  | "withdrawal"
  | "adjustment"
  | "mall_prize"

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
 * lazily on first credit. Withdrawal to a real fiat/crypto rail is a documented
 * stub for a later phase — balances are credited honestly, never faked.
 */
class BuyerWalletModuleService extends MedusaService({ Wallet, WalletLedger }) {
  /** Get-or-create the wallet for a buyer email. */
  async getOrCreate(buyerEmail: string, currencyCode = "ngn") {
    const email = buyerEmail.trim().toLowerCase()
    const [existing] = await this.listWallets({ buyer_email: email })
    if (existing) {
      return existing
    }
    return await this.createWallets({
      buyer_email: email,
      currency_code: currencyCode,
      balance: 0,
    })
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
    const [ledger] = await this.createWalletLedgers([
      {
        wallet: wallet.id,
        amount,
        source: input.source,
        reference: input.reference ?? null,
      },
    ])
    const [updated] = await this.updateWallets([
      { id: wallet.id, balance: round2(Number(wallet.balance) + amount) },
    ])
    return { wallet: updated, ledger }
  }

  /**
   * Debit a buyer (e.g. a future withdrawal). Refuses to overdraw — the balance
   * can never go negative through this API.
   */
  async debit(input: CreditInput) {
    if (!(Number.isFinite(input.amount) && input.amount > 0)) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "A wallet debit must be a positive number"
      )
    }
    const email = input.buyerEmail.trim().toLowerCase()
    const [wallet] = await this.listWallets({ buyer_email: email })
    if (!wallet || Number(wallet.balance) < input.amount - 0.001) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "Insufficient buyer wallet balance"
      )
    }
    const amount = round2(input.amount)
    const [ledger] = await this.createWalletLedgers([
      {
        wallet: wallet.id,
        amount: -amount,
        source: input.source,
        reference: input.reference ?? null,
      },
    ])
    const [updated] = await this.updateWallets([
      { id: wallet.id, balance: round2(Number(wallet.balance) - amount) },
    ])
    return { wallet: updated, ledger }
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
}

export default BuyerWalletModuleService

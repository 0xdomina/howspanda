import { MedusaService, MedusaError } from "@medusajs/framework/utils"
import NimiqQuote from "./models/nimiq-quote"
import NimiqPayout from "./models/nimiq-payout"
import { verifyUsdtTransfer } from "../../lib/nimiq/chain"
import { usdtNgnRate } from "../../lib/nimiq/rate"
import { payoutCapMajor, polygonConfig, sendUsdt, waitReceipt } from "../../lib/crypto/evm"

export { usdtNgnRate }

const QUOTE_TTL_MIN_DEFAULT = 10

function quoteTtlMs(): number {
  const mins = Number(process.env.NIMIQ_QUOTE_TTL_MIN)
  const m = Number.isFinite(mins) && mins > 0 ? mins : QUOTE_TTL_MIN_DEFAULT
  return m * 60 * 1000
}

export function merchantFor(token: "USDT" | "NIM"): string {
  const addr =
    token === "USDT"
      ? process.env.NIMIQ_USDT_MERCHANT
      : process.env.NIMIQ_NIM_MERCHANT
  if (!addr) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      `${token} settlement is not configured`
    )
  }
  return addr
}

/** NGN minor → USDT base units (6dp) at the live quoted rate. */
export async function ngnMinorToUsdtBase(ngnMinor: number): Promise<bigint> {
  const usdtMajor = ngnMinor / 100 / (await usdtNgnRate())
  return BigInt(Math.round(usdtMajor * 1_000_000))
}

class NimiqModuleService extends MedusaService({
  NimiqQuote,
  NimiqPayout,
}) {
  async getQuote(id: string) {
    const [quote] = await this.listNimiqQuotes({ id })
    return quote ?? null
  }

  async quoteByTxHash(txHash: string) {
    const [quote] = await this.listNimiqQuotes({ tx_hash: txHash })
    return quote ?? null
  }

  /** Persist a priced quote. Pricing itself is resolved by the caller. */
  async persistQuote(input: {
    buyerEmail?: string | null
    cartId?: string | null
    token: "USDT" | "NIM"
    network: string
    amountTokenBase: bigint
    amountNgnMinor: number
    merchantAddress: string
    reference: string
    items: unknown
    expiresAt: Date
  }) {
    const quote = await this.createNimiqQuotes({
      buyer_email: input.buyerEmail ?? null,
      cart_id: input.cartId ?? null,
      token: input.token,
      network: input.network,
      // Quote-size base units always fit safely (stablecoin, commerce sums).
      amount_token_base: Number(input.amountTokenBase),
      amount_ngn_minor: input.amountNgnMinor,
      merchant_address: input.merchantAddress,
      reference: input.reference,
      items: (input.items ?? null) as any,
      status: "quoted" as const,
      expires_at: input.expiresAt,
    })
    return quote
  }

  async markExpired(id: string) {
    const [updated] = await this.updateNimiqQuotes([
      { id, status: "expired" as const },
    ])
    return updated
  }

  async markFailed(id: string) {
    const [updated] = await this.updateNimiqQuotes([
      { id, status: "failed" as const },
    ])
    return updated
  }

  /**
   * Verify a wallet payment against its quote. Fail-closed at every step:
   * unknown quote, non-quoted status, expiry, tx replay, chain mismatch all
   * reject without side effects. Returns the paid quote.
   */
  async verifyPayment(input: { quoteId: string; txHash: string; sender?: string }) {
    const txHash = (input.txHash ?? "").trim()
    if (!/^0x[0-9a-fA-F]{64}$/.test(txHash)) {
      throw new MedusaError(MedusaError.Types.INVALID_DATA, "Bad transaction hash")
    }
    const quote = await this.getQuote(input.quoteId)
    if (!quote) {
      throw new MedusaError(MedusaError.Types.NOT_FOUND, "Quote not found")
    }
    if (quote.status !== "quoted") {
      throw new MedusaError(
        MedusaError.Types.CONFLICT,
        `Quote is already ${quote.status}`
      )
    }
    if (new Date((quote as any).expires_at).getTime() < Date.now()) {
      await this.markExpired(quote.id).catch(() => null)
      throw new MedusaError(MedusaError.Types.INVALID_DATA, "Quote expired")
    }
    const replay = await this.quoteByTxHash(txHash)
    if (replay) {
      throw new MedusaError(
        MedusaError.Types.CONFLICT,
        "Transaction already used"
      )
    }
    if (quote.token !== "USDT") {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "NIM verification opens after the USDT path is proven"
      )
    }
    const check = await verifyUsdtTransfer({
      txHash,
      merchant: quote.merchant_address,
      expectedBaseUnits: BigInt(Number(quote.amount_token_base)),
      expectedSender: input.sender,
    })
    if (!check.ok) {
      await this.markFailed(quote.id).catch(() => null)
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        check.reason
      )
    }
    const [paid] = await this.updateNimiqQuotes([
      {
        id: quote.id,
        status: "paid" as const,
        tx_hash: txHash,
        verified_at: new Date(),
        ...(input.sender ? { payer_address: input.sender.toLowerCase() } : {}),
      },
    ])
    return paid
  }

  /**
   * Record a refund payout for a paid quote. Destination is allowlisted to
   * the quote's bound payer address — anything else is refused, whatever
   * the caller asks for. Idempotent per order while one is open.
   */
  async requestPayout(input: { orderId: string }) {
    const [quote] = await this.listNimiqQuotes({ order_id: input.orderId } as any)
    if (!quote || quote.status !== "paid") {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "No paid crypto payment on this order"
      )
    }
    if (quote.token !== "USDT") {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "Refunds support USDT for now"
      )
    }
    const destination = ((quote as any).payer_address as string | null) ?? null
    if (!destination) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "No verified payer to refund"
      )
    }
    const open = await this.listNimiqPayouts({
      order_id: input.orderId,
      status: ["requested", "sent"],
    } as any)
    if (open.length) return open[0]
    const usdtMajor = Number(quote.amount_token_base) / 1_000_000
    if (!(usdtMajor > 0) || usdtMajor > payoutCapMajor()) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "Refund above the payout cap"
      )
    }
    const payout = await this.createNimiqPayouts({
      order_id: input.orderId,
      quote_id: quote.id,
      token: "USDT" as const,
      network: quote.network,
      destination: destination.toLowerCase(),
      amount_token_base: Number(quote.amount_token_base),
      status: "requested" as const,
    })
    return payout
  }

  /**
   * Execute a requested payout from the hot wallet and confirm on chain.
   * Fails closed; the row records the outcome for retry. Never throws
   * secrets — errors carry codes only.
   */
  async executePayout(payoutId: string) {
    const [payout] = await this.listNimiqPayouts({ id: payoutId })
    if (!payout) {
      throw new MedusaError(MedusaError.Types.NOT_FOUND, "Payout not found")
    }
    if ((payout as any).status === "confirmed") return payout
    if (!process.env.NIMIQ_HOT_WALLET_KEY) {
      await this.updateNimiqPayouts([
        { id: payout.id, status: "failed" as const, last_error: "Hot wallet not configured" },
      ]).catch(() => null)
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "Refunds are not configured yet"
      )
    }
    const cfg = await polygonConfig()
    const baseUnits = BigInt(Number((payout as any).amount_token_base))
    await this.updateNimiqPayouts([
      {
        id: payout.id,
        attempts: Number((payout as any).attempts ?? 0) + 1,
        last_error: null,
      },
    ]).catch(() => null)
    try {
      const txHash = await sendUsdt({
        cfg,
        to: (payout as any).destination,
        baseUnits,
      })
      await this.updateNimiqPayouts([
        { id: payout.id, status: "sent" as const, tx_hash: txHash },
      ])
      const receipt = await waitReceipt(cfg, txHash, 12)
      if (!receipt.ok) {
        await this.updateNimiqPayouts([
          { id: payout.id, status: "failed" as const, last_error: receipt.reason },
        ])
        throw new MedusaError(MedusaError.Types.INVALID_DATA, receipt.reason)
      }
      const [confirmed] = await this.updateNimiqPayouts([
        {
          id: payout.id,
          status: "confirmed" as const,
          confirmed_at: new Date(),
        } as any,
      ])
      return confirmed
    } catch (error: any) {
      if (error?.type) throw error
      await this.updateNimiqPayouts([
        {
          id: payout.id,
          status: "failed" as const,
          last_error: String(error?.message ?? error).slice(0, 200),
        },
      ]).catch(() => null)
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "Refund transfer failed"
      )
    }
  }
}

export default NimiqModuleService

import { MedusaService, MedusaError } from "@medusajs/framework/utils"
import NimiqQuote from "./models/nimiq-quote"
import { verifyUsdtTransfer } from "../../lib/nimiq/chain"

const QUOTE_TTL_MIN_DEFAULT = 10

function quoteTtlMs(): number {
  const mins = Number(process.env.NIMIQ_QUOTE_TTL_MIN)
  const m = Number.isFinite(mins) && mins > 0 ? mins : QUOTE_TTL_MIN_DEFAULT
  return m * 60 * 1000
}

export function usdtNgnRate(): number {
  const r = Number(process.env.NIMIQ_USDT_NGN_RATE)
  if (!Number.isFinite(r) || r <= 0) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "USDT pricing is not configured"
    )
  }
  return r
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

/** NGN minor → USDT base units (6dp) at the operator rate. */
export function ngnMinorToUsdtBase(ngnMinor: number): bigint {
  const usdtMajor = ngnMinor / 100 / usdtNgnRate()
  return BigInt(Math.round(usdtMajor * 1_000_000))
}

class NimiqModuleService extends MedusaService({
  NimiqQuote,
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
    buyerEmail: string
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
      buyer_email: input.buyerEmail,
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
  async verifyPayment(input: { quoteId: string; txHash: string }) {
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
      },
    ])
    return paid
  }
}

export default NimiqModuleService

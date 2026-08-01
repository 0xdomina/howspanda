import { MedusaError, MedusaService } from "@medusajs/framework/utils"
import Tip from "./models/tip"

const round2 = (n: number) => Math.round(n * 100) / 100

export type CreateTipInput = {
  direction: "to_seller" | "to_buyer"
  orderId?: string | null
  buyerEmail: string
  sellerId: string
  currencyCode?: string
  /** cash value; null for extra-product tips */
  amount?: number | null
  /** extra-product tips (seller → buyer) */
  productId?: string | null
  productTitle?: string | null
  note?: string | null
  /** the marketplace CommissionLine that carries the cash settlement */
  commissionLineId?: string | null
}

/**
 * `tipping` owns the {Tip} record — the social/human fact of a gratuity. It
 * deliberately does NOT touch money: settlement is written by the route layer
 * into the marketplace commission ledger (0% commission), mirroring how the
 * reviews module stays pure and composes with marketplace at the route.
 */
class TippingModuleService extends MedusaService({ Tip }) {
  /**
   * Validate + record a tip. Seller for `to_seller`, currency and the cash value
   * are resolved by the caller; a `to_buyer` cash tip automatically issues a
   * buyer credit note (redemption deferred to a buyer-wallet phase).
   */
  async createTip(input: CreateTipInput) {
    const {
      direction,
      buyerEmail,
      sellerId,
      currencyCode = "ngn",
      amount,
      productId,
      productTitle,
      note,
      commissionLineId,
      orderId,
    } = input

    const isCash = Number.isFinite(amount) && (amount as number) > 0
    if (direction === "to_buyer" && !isCash && !productId && !productTitle) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "A seller tip needs either a cash amount or an extra product"
      )
    }
    if (isCash && !(Number(amount) > 0)) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "A tip amount must be a positive number"
      )
    }

    return await this.createTips({
      direction,
      order_id: orderId ?? null,
      buyer_email: buyerEmail,
      seller_id: sellerId,
      currency_code: currencyCode,
      amount: isCash ? round2(amount as number) : null,
      product_id: productId ?? null,
      product_title: productTitle ?? null,
      note: note ?? null,
      status: "available",
      commission_line_id: commissionLineId ?? null,
      // cash gift FROM the seller issues the buyer-side credit note
      buyer_credit_status: direction === "to_buyer" && isCash ? "issued" : null,
      buyer_credit_code:
        direction === "to_buyer" && isCash ? this.genCreditCode() : null,
    })
  }

  /** A seller's tips, newest first. */
  async listForSeller(sellerId: string) {
    return await this.listTips(
      { seller_id: sellerId },
      { order: { created_at: "DESC" } }
    )
  }

  /** Plain totals across a seller's tips (in = buyer→seller, out = seller→buyer). */
  async summary(sellerId: string) {
    const tips = await this.listTips({ seller_id: sellerId }, { take: null })
    let inAmount = 0
    let outAmount = 0
    let productCount = 0
    for (const tip of tips) {
      if (tip.direction === "to_seller") {
        inAmount = round2(
          inAmount + (tip.status === "reversed" ? 0 : Number(tip.amount ?? 0))
        )
      } else if (tip.amount) {
        outAmount = round2(
          outAmount + (tip.status === "reversed" ? 0 : Number(tip.amount))
        )
      } else {
        productCount += 1
      }
    }
    return {
      count: tips.length,
      in_amount: inAmount,
      out_amount: outAmount,
      product_tips: productCount,
    }
  }

  private genCreditCode(): string {
    return `CR-${Math.random().toString(36).slice(2, 8).toUpperCase()}`
  }
}

export default TippingModuleService

import {
  MedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { MedusaError } from "@medusajs/framework/utils"
import { TIPPING_MODULE } from "../../../../../modules/tipping"
import TippingModuleService from "../../../../../modules/tipping/service"
import type MarketplaceModuleService from "../../../../../modules/marketplace/service"
import { MARKETPLACE_MODULE } from "../../../../../modules/marketplace"
import { assertOrderEmail } from "../../../../../lib/escrow/order-access"

// Buyer → seller cash gratuity. Guests prove ownership with order id + email;
// authenticated customers are additionally bound to the order email (Phase 6
// gate, hardened in order-access). Settlement is written here into the
// marketplace ledger as a 0%-commission, immediately-`available` CommissionLine
// so the tip flows into the seller's balance and out through the payout rails.
export const POST = async (req: MedusaRequest, res: MedusaResponse) => {
  const { email, amount, note } = req.validatedBody as {
    email: string
    amount: number
    note?: string
  }
  const orderId = req.params.id
  const access = await assertOrderEmail(req.scope, orderId, email, req)

  const marketplace =
    req.scope.resolve<MarketplaceModuleService>(MARKETPLACE_MODULE)
  const lines = await marketplace.resolveLinesForOrder(orderId)
  const sellerId = lines.find((l) => l.seller_id)?.seller_id
  if (!sellerId) {
    throw new MedusaError(
      MedusaError.Types.NOT_FOUND,
      "No seller found for order — cannot tip"
    )
  }
  const currency = lines.find((l) => l.currency_code)?.currency_code ?? "ngn"

  // 0% platform commission — the full tip nets to the seller (locked spec).
  const line = await marketplace.createCommissionLines([
    {
      order_id: `tip:${orderId}:${Date.now()}`,
      parent_order_id: orderId,
      currency_code: currency,
      order_total: amount,
      rate: 0,
      commission_amount: 0,
      net_amount: amount,
      status: "available",
      available_at: new Date(),
      seller_id: sellerId,
    },
  ])

  const tipping: TippingModuleService = req.scope.resolve(TIPPING_MODULE)
  const tip = await tipping.createTip({
    direction: "to_seller",
    orderId,
    buyerEmail: access.email,
    sellerId,
    currencyCode: currency,
    amount,
    note,
    commissionLineId: line[0]?.id ?? null,
  })

  res.json({ tip })
}

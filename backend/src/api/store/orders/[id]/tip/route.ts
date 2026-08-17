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
import { computeCommission } from "../../../../../lib/marketplace/commission"

// A cash tip is booked as an immediately-withdrawable `available` commission
// line for the seller, so it MUST be treated as money-in: only a signed-in
// buyer (route middleware enforces this) who owns the order may tip, the
// amount is bounded, and each order can be tipped once. Without these guards
// anyone with an order id + email could mint unlimited withdrawable balance.
const TIP_MIN_NGN = 100
const TIP_MAX_NGN = 50000

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

  if (!(Number.isFinite(amount) && amount >= TIP_MIN_NGN && amount <= TIP_MAX_NGN)) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      `Tip amount must be between ${TIP_MIN_NGN} and ${TIP_MAX_NGN}`
    )
  }

  const tipping: TippingModuleService = req.scope.resolve(TIPPING_MODULE)
  const [prior] = await tipping.listTips({
    order_id: orderId,
    buyer_email: access.email,
    direction: "to_seller",
  })
  if (prior) {
    throw new MedusaError(
      MedusaError.Types.CONFLICT,
      "This order has already been tipped — one tip per order"
    )
  }

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

  // Tips ride the same tiered platform commission as orders (3–5%, tapering
  // down on larger values). A ₦15k tip is a small value → 5%; withheld here at
  // the ledger line so it holds whether the order was paid by card or USDC.
  const { rate, commission, net } = computeCommission(amount)
  // Record the social action first. The database uniqueness guard makes this
  // idempotent under concurrent clicks; the ledger line is linked only after
  // the tip record exists, so a rejected duplicate cannot mint balance.
  const tip = await tipping.createTip({
    direction: "to_seller",
    orderId,
    buyerEmail: access.email,
    sellerId,
    currencyCode: currency,
    amount,
    note,
    commissionLineId: null,
  })

  try {
    const line = await marketplace.createCommissionLines([
      {
        order_id: `tip:${orderId}:${tip.id}`,
        parent_order_id: orderId,
        currency_code: currency,
        order_total: amount,
        rate,
        commission_amount: commission,
        net_amount: net,
        status: "available",
        available_at: new Date(),
        seller_id: sellerId,
      },
    ])
    await tipping.updateTips({ id: tip.id, commission_line_id: line[0]?.id ?? null })
  } catch (error) {
    await tipping.updateTips({ id: tip.id, status: "reversed" })
    throw error
  }

  res.json({ tip })
}

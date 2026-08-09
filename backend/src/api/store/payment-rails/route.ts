import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { PAYMENT_RAILS_MODULE } from "../../../modules/payment-rails"
import PaymentRailModuleService from "../../../modules/payment-rails/service"
import { isCryptoGatedForCart } from "../../../lib/payments/seller-crypto-gate"

// Public rail status for the storefront: which rails are on, and their mode.
// Read-only and secret-free — the frontend gates its payment/withdrawal UI on
// the `enabled` flags. (The mode field is informational so the UI can label
// test/mock rails.)
//
// Optional `?cart_id=` applies the per-seller crypto gate: when any seller
// represented in that cart has crypto payments disabled, the crypto-usdc rail
// is reported `enabled: false` for that cart even though the rail is on
// platform-wide. The checkout form passes its cart id to hide the USDC option
// for those carts.
export const GET = async (
  req: MedusaRequest,
  res: MedusaResponse
) => {
  const rails: PaymentRailModuleService = req.scope.resolve(PAYMENT_RAILS_MODULE)
  const status = await rails.getStatus()

  const cartId = typeof req.query.cart_id === "string" ? req.query.cart_id : undefined
  if (cartId) {
    const gated = await isCryptoGatedForCart(req.scope, cartId)
    if (gated) {
      status.rails = status.rails.map((rail) =>
        rail.key === "crypto-usdc" ? { ...rail, enabled: false } : rail
      )
    }
  }

  res.json(status)
}

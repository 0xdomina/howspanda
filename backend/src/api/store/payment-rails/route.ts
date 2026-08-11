import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { PAYMENT_RAILS_MODULE } from "../../../modules/payment-rails"
import PaymentRailModuleService from "../../../modules/payment-rails/service"
import { isCryptoGatedForCart } from "../../../lib/payments/seller-crypto-gate"
import { getBankTransferSellerForCart } from "../../../lib/payments/bank-transfer-gate"

// Public rail status for the storefront: which rails are on, and their mode.
// Read-only and secret-free — the frontend gates its payment/withdrawal UI on
// the `enabled` flags. (The mode field is informational so the UI can label
// test/mock rails.)
//
// Optional `?cart_id=` applies the per-seller gates: when any seller in the
// cart has crypto payments disabled, the crypto-usdc rail is reported off;
// when the cart can't receive a direct-to-seller transfer (no single seller
// with a verified bank account), the bank-transfer rail is reported off. The
// checkout form passes its cart id to hide those options for the cart.
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
    const transferSeller = await getBankTransferSellerForCart(req.scope, cartId)
    if (!transferSeller) {
      status.rails = status.rails.map((rail) =>
        rail.key === "system_default" ? { ...rail, enabled: false } : rail
      )
    }
  }

  res.json(status)
}

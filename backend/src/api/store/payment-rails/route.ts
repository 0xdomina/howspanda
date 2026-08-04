import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { PAYMENT_RAILS_MODULE } from "../../../modules/payment-rails"
import PaymentRailModuleService from "../../../modules/payment-rails/service"

// Public rail status for the storefront: which rails are on, and their mode.
// Read-only and secret-free — the frontend gates its payment/withdrawal UI on
// the `enabled` flags. (The mode field is informational so the UI can label
// test/mock rails.)
export const GET = async (
  _req: MedusaRequest,
  res: MedusaResponse
) => {
  const rails: PaymentRailModuleService = _req.scope.resolve(PAYMENT_RAILS_MODULE)
  res.json(await rails.getStatus())
}

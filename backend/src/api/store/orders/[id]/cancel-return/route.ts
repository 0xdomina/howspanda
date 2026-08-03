import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MARKETPLACE_MODULE } from "../../../../../modules/marketplace"
import MarketplaceModuleService from "../../../../../modules/marketplace/service"
import { assertOrderEmail } from "../../../../../lib/escrow/order-access"

// Buyer withdraws the return → the hold lifts and the original release
// schedule resumes (the hourly job releases if the window already passed).
export const POST = async (req: MedusaRequest, res: MedusaResponse) => {
  const { email } = req.validatedBody as { email: string }
  await assertOrderEmail(req.scope, req.params.id, email, req)

  const marketplace: MarketplaceModuleService =
    req.scope.resolve(MARKETPLACE_MODULE)
  const lines = await marketplace.liftHold(req.params.id)

  res.json({ order_id: req.params.id, lines })
}

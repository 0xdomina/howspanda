import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { MARKETPLACE_MODULE } from "../../../../modules/marketplace"
import MarketplaceModuleService from "../../../../modules/marketplace/service"

// Platform dispute intervention: freeze an order's escrow.
export const POST = async (
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) => {
  const { order_id, reason } = req.validatedBody as {
    order_id: string
    reason: string
  }

  const marketplace: MarketplaceModuleService =
    req.scope.resolve(MARKETPLACE_MODULE)
  const lines = await marketplace.holdForReturn(order_id, reason)

  res.json({ order_id, lines })
}

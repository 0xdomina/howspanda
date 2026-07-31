import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { MARKETPLACE_MODULE } from "../../../../modules/marketplace"
import MarketplaceModuleService from "../../../../modules/marketplace/service"

// Dispute resolved in the seller's favor: lift the hold — optionally
// releasing the funds immediately instead of waiting for the window/cron.
export const POST = async (
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) => {
  const { order_id, release_now } = req.validatedBody as {
    order_id: string
    release_now?: boolean
  }

  const marketplace: MarketplaceModuleService =
    req.scope.resolve(MARKETPLACE_MODULE)
  const lines = await marketplace.liftHold(order_id, {
    releaseNow: release_now ?? false,
  })

  res.json({ order_id, lines })
}

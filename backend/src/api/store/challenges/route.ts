import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { GROWTH_MODULE } from "../../../modules/growth"
import GrowthModuleService from "../../../modules/growth/service"

// Public storefront listing: only challenges that are live right now.
export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
  const growth = req.scope.resolve<GrowthModuleService>(GROWTH_MODULE)
  const challenges = await growth.listLiveChallenges()
  res.json({ challenges })
}

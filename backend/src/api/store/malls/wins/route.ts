import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import MallModuleService from "../../../../modules/mall/service"
import { MALL_MODULE } from "../../../../modules/mall"

// Newest prize wins across all malls — feeds the storefront win ticker.
// Public: amounts and mall names only, no buyer PII beyond a masked email
// handled by the storefront.
export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
  const mallService = req.scope.resolve<MallModuleService>(MALL_MODULE)
  const wins = await mallService.recentWins(5)
  res.json({ wins })
}

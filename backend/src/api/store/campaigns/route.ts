import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { CAMPAIGNS_MODULE } from "../../../modules/campaigns"
import CampaignsModuleService from "../../../modules/campaigns/service"

// Public storefront listing: only campaigns that are live right now.
export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
  const campaigns = req.scope.resolve<CampaignsModuleService>(CAMPAIGNS_MODULE)
  const list = await campaigns.listLiveCampaigns()
  res.json({ campaigns: list })
}

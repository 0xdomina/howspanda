import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { z } from "@medusajs/framework/zod"
import { CAMPAIGNS_MODULE } from "../../../../../modules/campaigns"
import CampaignsModuleService from "../../../../../modules/campaigns/service"
import { PostCampaignSettleSchema } from "../../../../middlewares"

type PostBody = z.infer<typeof PostCampaignSettleSchema>

// Admin pool settle: the pool splits pro-rata across scored participants.
// Each share issues a reward in the template kind for later claiming.
export const POST = async (
  req: MedusaRequest<PostBody>,
  res: MedusaResponse
) => {
  const { id } = req.params as { id: string }
  const campaigns = req.scope.resolve<CampaignsModuleService>(CAMPAIGNS_MODULE)
  const result = await campaigns.settleCampaign(id, req.validatedBody.pool_ngn)
  res.json(result)
}

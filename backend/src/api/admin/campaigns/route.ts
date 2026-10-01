import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MedusaError } from "@medusajs/framework/utils"
import { z } from "@medusajs/framework/zod"
import { CAMPAIGNS_MODULE } from "../../../modules/campaigns"
import CampaignsModuleService from "../../../modules/campaigns/service"
import { PostCampaignCreateSchema } from "../../middlewares"

type PostBody = z.infer<typeof PostCampaignCreateSchema>

// Admin campaign management. Creating always starts a campaign in `draft`;
// flipping to `live` (or setting ends_at) is the on/off + time-expiry control.
export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
  const campaigns = req.scope.resolve<CampaignsModuleService>(CAMPAIGNS_MODULE)
  const list = await campaigns.listCampaigns(
    {},
    { order: { created_at: "DESC" } }
  )
  res.json({ campaigns: list })
}

export const POST = async (req: MedusaRequest<PostBody>, res: MedusaResponse) => {
  const campaigns = req.scope.resolve<CampaignsModuleService>(CAMPAIGNS_MODULE)
  const body = req.validatedBody

  const [existing] = await campaigns.listCampaigns({ slug: body.slug })
  if (existing) {
    throw new MedusaError(
      MedusaError.Types.CONFLICT,
      "A campaign with this slug already exists"
    )
  }

  const [campaign] = await campaigns.createCampaigns([
    {
      name: body.name,
      slug: body.slug,
      sponsor: body.sponsor ?? null,
      status: "draft" as const,
      audience: body.audience,
      store_ids: body.store_ids?.length ? { ids: body.store_ids } : null,
      event: body.event,
      rules: body.rules ?? {},
      reward_template: body.reward_template ?? null,
      pool_ngn: body.pool_ngn ?? 0,
      per_user_cap_ngn: body.per_user_cap_ngn ?? null,
      global_cap_ngn: body.global_cap_ngn ?? null,
      starts_at: body.starts_at ?? null,
      ends_at: body.ends_at ?? null,
      claim_until: body.claim_until ?? null,
    },
  ])
  res.status(201).json({ campaign })
}

import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { z } from "@medusajs/framework/zod"
import { CAMPAIGNS_MODULE } from "../../../../modules/campaigns"
import CampaignsModuleService from "../../../../modules/campaigns/service"
import { PatchCampaignUpdateSchema } from "../../../middlewares"

type PatchBody = z.infer<typeof PatchCampaignUpdateSchema>

// Admin campaign detail + on/off + time-expiry. Flipping `status` live/paused
// is the kill switch; `ends_at` (set or backdated) enforces time expiry.
export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
  const { id } = req.params as { id: string }
  const campaigns = req.scope.resolve<CampaignsModuleService>(CAMPAIGNS_MODULE)
  const campaign = await campaigns.getCampaign(id)
  const stats = await campaigns.statsForCampaign(campaign.id)
  res.json({ campaign, stats })
}

export const PATCH = async (
  req: MedusaRequest<PatchBody>,
  res: MedusaResponse
) => {
  const { id } = req.params as { id: string }
  const campaigns = req.scope.resolve<CampaignsModuleService>(CAMPAIGNS_MODULE)
  const campaign = await campaigns.getCampaign(id)
  const body = req.validatedBody

  const patch: Record<string, unknown> = {}
  if (body.name !== undefined) {
    patch.name = body.name
  }
  if (body.sponsor !== undefined) {
    patch.sponsor = body.sponsor
  }
  if (body.status !== undefined) {
    patch.status = body.status
  }
  if (body.audience !== undefined) {
    patch.audience = body.audience
  }
  if (body.store_ids !== undefined) {
    patch.store_ids = body.store_ids?.length ? { ids: body.store_ids } : null
  }
  if (body.event !== undefined) {
    patch.event = body.event
  }
  if (body.rules !== undefined) {
    patch.rules = body.rules
  }
  if (body.reward_template !== undefined) {
    patch.reward_template = body.reward_template
  }
  if (body.pool_ngn !== undefined) {
    patch.pool_ngn = body.pool_ngn
  }
  if (body.per_user_cap_ngn !== undefined) {
    patch.per_user_cap_ngn = body.per_user_cap_ngn
  }
  if (body.global_cap_ngn !== undefined) {
    patch.global_cap_ngn = body.global_cap_ngn
  }
  if (body.starts_at !== undefined) {
    patch.starts_at = body.starts_at
  }
  if (body.ends_at !== undefined) {
    patch.ends_at = body.ends_at
  }
  if (body.claim_until !== undefined) {
    patch.claim_until = body.claim_until
  }

  const [updated] = await campaigns.updateCampaigns([
    { id: campaign.id, ...patch },
  ])
  res.json({ campaign: updated })
}

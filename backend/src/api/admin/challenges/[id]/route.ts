import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { z } from "@medusajs/framework/zod"
import { GROWTH_MODULE } from "../../../../modules/growth"
import GrowthModuleService from "../../../../modules/growth/service"
import { PatchChallengeUpdateSchema } from "../../../middlewares"

type PatchBody = z.infer<typeof PatchChallengeUpdateSchema>

// Admin challenge detail + on/off + time-expiry. Flipping `status` live/draft is
// the kill switch; `ends_at` (set or backdated) enforces campaign time expiry.
export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
  const { id } = req.params as { id: string }
  const growth = req.scope.resolve<GrowthModuleService>(GROWTH_MODULE)
  const challenge = await growth.getChallenge(id)
  const stats = await growth.statsForChallenge(challenge.id)
  res.json({ challenge, stats })
}

export const PATCH = async (
  req: MedusaRequest<PatchBody>,
  res: MedusaResponse
) => {
  const { id } = req.params as { id: string }
  const growth = req.scope.resolve<GrowthModuleService>(GROWTH_MODULE)
  const challenge = await growth.getChallenge(id)
  const body = req.validatedBody

  const patch: Record<string, unknown> = {}
  if (body.name !== undefined) {
    patch.name = body.name
  }
  if (body.description !== undefined) {
    patch.description = body.description
  }
  if (body.status !== undefined) {
    patch.status = body.status
  }
  if (body.starts_at !== undefined) {
    patch.starts_at = body.starts_at
  }
  if (body.ends_at !== undefined) {
    patch.ends_at = body.ends_at
  }
  if (body.config !== undefined) {
    patch.config = body.config
  }

  const [updated] = await growth.updateChallenges([
    { id: challenge.id, ...patch },
  ])
  res.json({ challenge: updated })
}

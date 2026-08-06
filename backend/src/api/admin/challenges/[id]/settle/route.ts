import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { z } from "@medusajs/framework/zod"
import { GROWTH_MODULE } from "../../../../../modules/growth"
import GrowthModuleService from "../../../../../modules/growth/service"
import { PostChallengeSettleSchema } from "../../../../middlewares"

type PostBody = z.infer<typeof PostChallengeSettleSchema>

// Admin revenue-share settle for an arc_pool challenge: the pool is split
// pro-rata across qualifying spend. Issued buyer credits, claimable at checkout
// time via the storefront (ledger source "campaign").
export const POST = async (
  req: MedusaRequest<PostBody>,
  res: MedusaResponse
) => {
  const { id } = req.params as { id: string }
  const growth = req.scope.resolve<GrowthModuleService>(GROWTH_MODULE)
  const result = await growth.settleArcPool(id, req.validatedBody.pool_ngn)
  res.json(result)
}

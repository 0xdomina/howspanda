import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { z } from "@medusajs/framework/zod"
import { GROWTH_MODULE } from "../../../../../modules/growth"
import GrowthModuleService from "../../../../../modules/growth/service"
import { PostChallengeDrawSchema } from "../../../../middlewares"

type PostBody = z.infer<typeof PostChallengeDrawSchema>

// Admin raffle draw for an arc_pool challenge. Seeded + auditable; each winner
// gets an issued buyer credit claimable from the storefront.
export const POST = async (req: MedusaRequest<PostBody>, res: MedusaResponse) => {
  const { id } = req.params as { id: string }
  const growth = req.scope.resolve<GrowthModuleService>(GROWTH_MODULE)
  const result = await growth.drawRaffle(id, {
    winnerCount: req.validatedBody.winner_count,
    prizeAmountNgn: req.validatedBody.prize_amount_ngn,
    seed: req.validatedBody.seed,
  })
  res.json(result)
}

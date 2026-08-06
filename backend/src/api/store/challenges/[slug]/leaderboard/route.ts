import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { GROWTH_MODULE } from "../../../../../modules/growth"
import GrowthModuleService from "../../../../../modules/growth/service"

// Public leaderboard for a challenge.
export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
  const { slug } = req.params as { slug: string }
  const growth = req.scope.resolve<GrowthModuleService>(GROWTH_MODULE)

  const challenge = await growth.getChallenge(slug)
  const result = await growth.getLeaderboard(challenge.id, { limit: 50 })

  res.json({ leaderboard: result.leaderboard })
}

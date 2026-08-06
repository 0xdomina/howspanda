import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { GROWTH_MODULE } from "../../../../modules/growth"
import GrowthModuleService from "../../../../modules/growth/service"
import { resolveCustomerEmail } from "../../../../lib/escrow/resolve-customer-email"

// Challenge detail + top of the leaderboard. Auth is optional: a signed-in buyer
// also gets their own standing (`mine`).
export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
  const { slug } = req.params as { slug: string }
  const growth = req.scope.resolve<GrowthModuleService>(GROWTH_MODULE)

  const challenge = await growth.getChallenge(slug)

  const actorId = (req as unknown as { auth_context?: { actor_id?: string } })
    .auth_context?.actor_id
  let actor: { type: "buyer"; buyerEmail: string } | undefined
  if (actorId) {
    const email = await resolveCustomerEmail(req)
    actor = { type: "buyer", buyerEmail: email }
  }

  const result = await growth.getLeaderboard(challenge.id, {
    limit: 20,
    actor,
  })

  const myRewards = actor
    ? await growth.listRewardsForActor(challenge.id, actor)
    : []

  res.json({
    challenge,
    leaderboard: result.leaderboard,
    mine: result.mine,
    my_rewards: myRewards,
  })
}

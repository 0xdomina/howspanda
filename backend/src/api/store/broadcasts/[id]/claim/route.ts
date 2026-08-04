import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { FOLLOWS_MODULE } from "../../../../../modules/follows"
import FollowsModuleService from "../../../../../modules/follows/service"

// A follower claims a giveaway broadcast. Only the fan-out recipients (real
// followers) can claim; one claim per follower per giveaway.
export const POST = async (
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) => {
  const follows = req.scope.resolve<FollowsModuleService>(FOLLOWS_MODULE)
  const customerId = req.auth_context.actor_id as string

  const result = await follows.claimGiveaway(req.params.id, customerId)
  res.json(result)
}

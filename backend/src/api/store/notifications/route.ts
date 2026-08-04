import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { FOLLOWS_MODULE } from "../../../modules/follows"
import FollowsModuleService from "../../../modules/follows/service"

// A customer's in-app notification feed (broadcasts from followed stores).
// Contact details are never present — broadcast copy is privacy-scanned at
// publish time and the platform is the only channel.
export const GET = async (
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) => {
  const follows = req.scope.resolve<FollowsModuleService>(FOLLOWS_MODULE)
  const customerId = req.auth_context.actor_id as string

  const result = await follows.listNotifications(customerId)
  res.json(result)
}

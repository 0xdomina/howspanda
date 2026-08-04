import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { FOLLOWS_MODULE } from "../../../../../modules/follows"
import FollowsModuleService from "../../../../../modules/follows/service"

// Mark one notification read (ownership enforced inside the service).
export const POST = async (
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) => {
  const follows = req.scope.resolve<FollowsModuleService>(FOLLOWS_MODULE)
  const customerId = req.auth_context.actor_id as string

  await follows.markNotificationsRead(customerId, [req.params.id])
  res.json({ ok: true })
}

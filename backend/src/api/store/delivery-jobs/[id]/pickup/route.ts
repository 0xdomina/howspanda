import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import DeliveryModuleService from "../../../../../modules/delivery/service"
import { DELIVERY_MODULE } from "../../../../../modules/delivery"
import { resolveActorEmail } from "../../../../../lib/accounts/resolve-actor-email"

// Pickup is a courier action: the actor must be the ACCEPTED courier on the
// job (the service checks the derived email against the accepted offer). The
// client can never claim a different courier identity than its own account.
export const POST = async (
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) => {
  const { id } = req.params as { id: string }
  const email = await resolveActorEmail(req)
  const deliveryService = req.scope.resolve<DeliveryModuleService>(DELIVERY_MODULE)
  const job = await deliveryService.markPickedUp(id, email)
  res.json({ job })
}

import { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import DeliveryModuleService from "../../../../../modules/delivery/service"
import { DELIVERY_MODULE } from "../../../../../modules/delivery"
import { resolveActorEmail } from "../../../../../lib/accounts/resolve-actor-email"

export const POST = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  const { id } = req.params as { id: string }
  const body = req.validatedBody as { reason: string }
  const email = await resolveActorEmail(req)
  const deliveryService = req.scope.resolve<DeliveryModuleService>(DELIVERY_MODULE)
  const result = await deliveryService.cancelJob(id, body.reason, email)
  res.json(result)
}

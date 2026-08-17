import { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import DeliveryModuleService from "../../../../../../modules/delivery/service"
import { DELIVERY_MODULE } from "../../../../../../modules/delivery"
import { resolveActorEmail } from "../../../../../../lib/accounts/resolve-actor-email"

// Couriers generate an in-app delivery code (shown to the recipient).
export const POST = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  const { id } = req.params as { id: string }
  const courierEmail = await resolveActorEmail(req)
  const deliveryService = req.scope.resolve<DeliveryModuleService>(DELIVERY_MODULE)
  const result = await deliveryService.generateVerification(id, "delivery", courierEmail)
  res.status(201).json(result)
}

import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import DeliveryModuleService from "../../../../../../modules/delivery/service"
import { DELIVERY_MODULE } from "../../../../../../modules/delivery"

// Couriers generate an in-app delivery code (shown to the recipient).
export const POST = async (req: MedusaRequest, res: MedusaResponse) => {
  const { id } = req.params as { id: string }
  const body = req.validatedBody as { courierEmail: string }
  const deliveryService = req.scope.resolve<DeliveryModuleService>(DELIVERY_MODULE)
  const result = await deliveryService.generateVerification(id, "delivery", body.courierEmail)
  res.status(201).json(result)
}

import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import DeliveryModuleService from "../../../../../modules/delivery/service"
import { DELIVERY_MODULE } from "../../../../../modules/delivery"

export const POST = async (req: MedusaRequest, res: MedusaResponse) => {
  const { id } = req.params as { id: string }
  const body = req.validatedBody as { courierEmail?: string }
  const deliveryService = req.scope.resolve<DeliveryModuleService>(DELIVERY_MODULE)
  const job = await deliveryService.markPickedUp(id, body?.courierEmail || "")
  res.json({ job })
}

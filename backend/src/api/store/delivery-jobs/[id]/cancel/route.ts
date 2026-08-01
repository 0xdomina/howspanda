import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import DeliveryModuleService from "../../../../../modules/delivery/service"
import { DELIVERY_MODULE } from "../../../../../modules/delivery"

export const POST = async (req: MedusaRequest, res: MedusaResponse) => {
  const { id } = req.params as { id: string }
  const body = req.validatedBody as { email?: string; reason?: string }
  const deliveryService = req.scope.resolve<DeliveryModuleService>(DELIVERY_MODULE)
  const result = await deliveryService.cancelJob(id, body?.reason || "", body?.email || "")
  res.json(result)
}

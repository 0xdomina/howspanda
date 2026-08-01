import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import DeliveryModuleService from "../../../../modules/delivery/service"
import { DELIVERY_MODULE } from "../../../../modules/delivery"

export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
  const { id } = req.params as { id: string }
  const deliveryService = req.scope.resolve<DeliveryModuleService>(DELIVERY_MODULE)
  const job = await deliveryService.getJob(id)
  res.json({ job })
}

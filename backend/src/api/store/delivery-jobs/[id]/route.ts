import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import DeliveryModuleService from "../../../../modules/delivery/service"
import { DELIVERY_MODULE } from "../../../../modules/delivery"
import { enrichJobWithPartyNames } from "../../../../lib/delivery/party-names"

export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
  const { id } = req.params as { id: string }
  const deliveryService = req.scope.resolve<DeliveryModuleService>(DELIVERY_MODULE)
  const job = await deliveryService.getJob(id)
  // Annotate offers, parties, and chat messages with human display names so
  // the UI never has to render emails.
  const enriched = await enrichJobWithPartyNames(req, job as any)
  res.json({ job: enriched })
}

import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import DeliveryModuleService from "../../../../../modules/delivery/service"
import { DELIVERY_MODULE } from "../../../../../modules/delivery"

// Timeline + messages (polling). `email` identifies the requesting party so we
// can gate reads to job parties.
export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
  const { id } = req.params as { id: string }
  const email = (req.query?.email as string) || undefined
  const deliveryService = req.scope.resolve<DeliveryModuleService>(DELIVERY_MODULE)
  const messages = await deliveryService.listMessages(id, email)
  res.json({ messages })
}

// Any job party can send a message (writes are gated in the service).
export const POST = async (req: MedusaRequest, res: MedusaResponse) => {
  const { id } = req.params as { id: string }
  const body = req.validatedBody as { senderEmail: string; body: string }
  const deliveryService = req.scope.resolve<DeliveryModuleService>(DELIVERY_MODULE)
  const message = await deliveryService.sendMessage({
    jobId: id,
    senderEmail: body.senderEmail,
    body: body.body,
  })
  res.status(201).json({ message })
}

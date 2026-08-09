import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import DeliveryModuleService from "../../../../../modules/delivery/service"
import { DELIVERY_MODULE } from "../../../../../modules/delivery"
import { resolvePartyNames } from "../../../../../lib/delivery/party-names"
import { resolveActorEmail } from "../../../../../lib/accounts/resolve-actor-email"

// Timeline + messages (polling). `email` identifies the requesting party so we
// can gate reads to job parties — it is REQUIRED (an anonymous read would leak
// party emails and address chatter to anyone who knows a job id).
export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
  const { id } = req.params as { id: string }
  const email = await resolveActorEmail(req)
  const deliveryService = req.scope.resolve<DeliveryModuleService>(DELIVERY_MODULE)
  const messages = await deliveryService.listMessages(id, email)
  // Annotate senders with display names so the chat renders names, not emails.
  const names = await resolvePartyNames(
    req,
    (messages as any[]).map((m) => m.sender_email)
  )
  const enriched = (messages as any[]).map((m) => ({
    ...m,
    sender_name: names[m.sender_email.trim().toLowerCase()] ?? null,
  }))
  res.json({ messages: enriched })
}

// Any job party can send a message (writes are gated in the service).
export const POST = async (req: MedusaRequest, res: MedusaResponse) => {
  const { id } = req.params as { id: string }
  const body = req.validatedBody as { body: string }
  const senderEmail = await resolveActorEmail(req)
  const deliveryService = req.scope.resolve<DeliveryModuleService>(DELIVERY_MODULE)
  const message = await deliveryService.sendMessage({
    jobId: id,
    senderEmail,
    body: body.body,
  })
  res.status(201).json({ message })
}

import {
  AuthenticatedMedusaRequest,
  MedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import {
  ContainerRegistrationKeys,
  MedusaError,
} from "@medusajs/framework/utils"
import DeliveryModuleService from "../../../modules/delivery/service"
import { DELIVERY_MODULE } from "../../../modules/delivery"
import type { PostJobInput } from "../../../modules/delivery/service"

// Anyone with a publishable key can browse open jobs (courier view).
export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
  const city = (req.query?.city as string) || undefined
  const deliveryService = req.scope.resolve<DeliveryModuleService>(DELIVERY_MODULE)
  const jobs = await deliveryService.listOpenJobs({ city })
  res.json({ jobs })
}

// A store owner posts a delivery job from a completed order in one call.
export const POST = async (
  req: AuthenticatedMedusaRequest<PostJobInput>,
  res: MedusaResponse
) => {
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const { data: [sellerAdmin] } = await query.graph({
    entity: "seller_admin",
    fields: ["id", "email", "phone", "seller.id"],
    filters: { id: [req.auth_context.actor_id] },
  })
  if (!sellerAdmin?.seller?.id) {
    throw new MedusaError(
      MedusaError.Types.UNAUTHORIZED,
      "Seller not found for authenticated actor"
    )
  }
  const sellerId = sellerAdmin.seller.id
  // Delivery parties are email-keyed, but phone-first sellers have no email —
  // fall back to the phone number so their sender party is still addressable.
  const senderEmail = sellerAdmin.email ?? sellerAdmin.phone
  if (!senderEmail) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "Seller has no email or phone on file"
    )
  }

  const body = req.validatedBody ?? (req.body as PostJobInput)
  const deliveryService = req.scope.resolve<DeliveryModuleService>(DELIVERY_MODULE)
  const job = await deliveryService.postJob({
    ...body,
    sellerId,
  })
  // Register the sender party so the sender-approval gate works.
  await deliveryService.ensureParty(job.id, "sender", senderEmail, sellerId)
  res.status(201).json({ job })
}

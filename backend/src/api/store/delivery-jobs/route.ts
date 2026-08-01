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
    fields: ["id", "email", "seller.id"],
    filters: { id: [req.auth_context.actor_id] },
  })
  if (!sellerAdmin?.seller?.id) {
    throw new MedusaError(
      MedusaError.Types.UNAUTHORIZED,
      "Seller not found for authenticated actor"
    )
  }
  const sellerId = sellerAdmin.seller.id
  const senderEmail = sellerAdmin.email

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

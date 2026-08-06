import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import {
  ContainerRegistrationKeys,
  MedusaError,
} from "@medusajs/framework/utils"
import DeliveryModuleService from "../../../../modules/delivery/service"
import { DELIVERY_MODULE } from "../../../../modules/delivery"
import { enrichOffersWithCourierNames } from "../../../../lib/delivery/party-names"

// A store owner's own delivery jobs, newest first (seller view).
export const GET = async (
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) => {
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const { data: [sellerAdmin] } = await query.graph({
    entity: "seller_admin",
    fields: ["id", "seller.id"],
    filters: { id: [req.auth_context.actor_id] },
  })
  if (!sellerAdmin?.seller?.id) {
    throw new MedusaError(
      MedusaError.Types.UNAUTHORIZED,
      "Seller not found for authenticated actor"
    )
  }
  const deliveryService = req.scope.resolve<DeliveryModuleService>(DELIVERY_MODULE)
  const jobs = await deliveryService.listJobsForSeller(sellerAdmin.seller.id)
  // Show courier names instead of emails in the offers list.
  const enriched = await enrichOffersWithCourierNames(req, jobs as any)
  res.json({ jobs: enriched })
}

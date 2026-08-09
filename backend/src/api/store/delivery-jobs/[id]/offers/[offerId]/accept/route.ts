import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import {
  ContainerRegistrationKeys,
  MedusaError,
} from "@medusajs/framework/utils"
import DeliveryModuleService from "../../../../../../../modules/delivery/service"
import { DELIVERY_MODULE } from "../../../../../../../modules/delivery"
import { requireSellerOwner } from "../../../../../../../lib/sellers/resolve-seller"

async function resolveSellerId(
  req: AuthenticatedMedusaRequest
): Promise<string> {
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
  return sellerAdmin.seller.id
}

// Only the store owner (sender) can accept an offer. The sender-party check
// lives in the service, so we just forward the resolved seller id as the
// sender identity.
export const POST = async (
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) => {
  await requireSellerOwner(req)
  const { id, offerId } = req.params as { id: string; offerId: string }
  const sellerId = await resolveSellerId(req)
  const deliveryService = req.scope.resolve<DeliveryModuleService>(DELIVERY_MODULE)
  const job = await deliveryService.acceptOffer(id, offerId, sellerId)
  res.json({ job })
}

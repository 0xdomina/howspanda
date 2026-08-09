import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import {
  ContainerRegistrationKeys,
  MedusaError,
} from "@medusajs/framework/utils"
import { MARKETPLACE_MODULE } from "../../../../../modules/marketplace"
import MarketplaceModuleService from "../../../../../modules/marketplace/service"
import { requireSellerPermission } from "../../../../../lib/sellers/resolve-seller"

const resolveOwnedLine = async (
  req: AuthenticatedMedusaRequest,
  orderId: string
) => {
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const { data: admins } = await query.graph({
    entity: "seller_admin",
    fields: ["seller.id"],
    filters: { id: req.auth_context.actor_id },
  })
  const sellerId = admins[0]?.seller?.id
  const marketplace: MarketplaceModuleService =
    req.scope.resolve(MARKETPLACE_MODULE)
  const [line] = await marketplace.listCommissionLines({ order_id: orderId })
  if (!line || !sellerId || line.seller_id !== sellerId) {
    throw new MedusaError(MedusaError.Types.NOT_FOUND, "Order not found")
  }
  return { marketplace, line }
}

// Seller records delivery → the buyer's return window starts ticking.
export const POST = async (
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) => {
  await requireSellerPermission(req, "orders")
  const { marketplace } = await resolveOwnedLine(req, req.params.id)
  await marketplace.markOrderDelivered(req.params.id)

  res.json({
    order_id: req.params.id,
    lines: await marketplace.resolveLinesForOrder(req.params.id),
  })
}

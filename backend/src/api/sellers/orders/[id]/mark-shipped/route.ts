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

// Seller dispatched the parcel — buyer sees "en route" before "delivered".
export const POST = async (
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) => {
  const context = await requireSellerPermission(req, "orders")
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const { data: admins } = (await query.graph({
    entity: "seller_admin",
    fields: ["seller.id"],
    filters: { id: [context.sellerAdminId] },
  })) as { data: any[] }
  const sellerId = admins[0]?.seller?.id
  const marketplace: MarketplaceModuleService =
    req.scope.resolve(MARKETPLACE_MODULE)
  const [line] = await marketplace.listCommissionLines({
    order_id: req.params.id,
  })
  if (!line || !sellerId || (line as any).seller_id !== sellerId) {
    throw new MedusaError(MedusaError.Types.NOT_FOUND, "Order not found")
  }

  await marketplace.markOrderShipped(req.params.id)

  res.json({
    order_id: req.params.id,
    lines: await marketplace.resolveLinesForOrder(req.params.id),
  })
}

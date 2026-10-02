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
import { NIMIQ_MODULE } from "../../../../../modules/nimiq"
import type NimiqModuleService from "../../../../../modules/nimiq/service"
import { requireSellerPermission } from "../../../../../lib/sellers/resolve-seller"

// Retry a failed crypto refund. Ownership-checked like every seller lane.
// Creates the payout row when missing (return-received path), executes it,
// and reports the outcome — the buyer email goes out on confirmed.
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

  const nimiq: NimiqModuleService = req.scope.resolve(NIMIQ_MODULE)
  const payout = await nimiq.requestPayout({ orderId: req.params.id })
  const done = await nimiq.executePayout(payout.id)

  res.json({
    order_id: req.params.id,
    refund: {
      status: (done as any).status,
      tx_hash: (done as any).tx_hash ?? null,
    },
  })
}

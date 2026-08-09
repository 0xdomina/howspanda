import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import {
  ContainerRegistrationKeys,
  MedusaError,
} from "@medusajs/framework/utils"
import MallModuleService from "../../../../../modules/mall/service"
import { MALL_MODULE } from "../../../../../modules/mall"
import { requireSellerOwner } from "../../../../../lib/sellers/resolve-seller"

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

// Author-only: bring an expired mall back to life — instantly live, with the
// same sellers and buyers and a fresh clock. Nothing is refunded; the net pool
// carries over.
export const POST = async (
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) => {
  await requireSellerOwner(req)
  const sellerId = await resolveSellerId(req)
  const { id } = req.params as { id: string }

  const mallService = req.scope.resolve<MallModuleService>(MALL_MODULE)
  const mall = await mallService.getDetails(id)
  if (mall.created_by_seller_id !== sellerId) {
    throw new MedusaError(
      MedusaError.Types.UNAUTHORIZED,
      "Only the mall creator can re-launch it"
    )
  }

  const body = (req.body ?? {}) as { durationDays?: number }
  const updated = await mallService.relaunch(id, body.durationDays)

  res.json({ mall: updated })
}

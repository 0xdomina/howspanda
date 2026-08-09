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
import { refundSellerMallContribution } from "../../../../../lib/mall/contributions"

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

// Author-only: wind down a pending or expired mall. Never launched → full
// gross refunds to every contributor; launched → opaque pro-rata refunds of
// the remaining net pool. Refunds are paid through the same rails as referral
// and challenge rewards: an "available" marketplace commission line per
// seller, so the money lands on each seller's payout balance.
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
      "Only the mall creator can cancel it"
    )
  }

  const { mall: updated, refunds } = await mallService.cancel(id)

  // Credit every contributor's payout balance via the marketplace ledger.
  for (const refund of refunds) {
    await refundSellerMallContribution(
      req,
      refund.seller_id,
      refund.amount,
      `${id}:${refund.seller_id}`
    )
  }

  res.json({ mall: updated, refundCount: refunds.length })
}

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
import { requireSellerPermission } from "../../../../../lib/sellers/resolve-seller"

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

export const POST = async (
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) => {
  await requireSellerPermission(req, "malls")
  const sellerId = await resolveSellerId(req)

  const { id } = req.params as { id: string }
  const body = req.validatedBody as {
    contributionNgn: number
    redeemableId?: string
  }

  if (!body?.contributionNgn || body.contributionNgn <= 0) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "contributionNgn must be a positive number"
    )
  }

  const mallService = req.scope.resolve<MallModuleService>(MALL_MODULE)
  const sellerJoin = await mallService.joinAsSeller({
    mallId: id,
    sellerId,
    contributionNgn: body.contributionNgn,
    redeemableId: body.redeemableId,
  })

  res.status(201).json({ sellerJoin })
}

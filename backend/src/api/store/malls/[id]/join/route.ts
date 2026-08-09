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
import {
  debitSellerMallContribution,
  refundSellerMallContribution,
} from "../../../../../lib/mall/contributions"

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
    productIds: string[]
    redeemableId?: string
  }

  if (!body?.contributionNgn || body.contributionNgn <= 0) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "contributionNgn must be a positive number"
    )
  }

  const mallService = req.scope.resolve<MallModuleService>(MALL_MODULE)
  const reference = `${id}:${sellerId}:${Date.now()}`
  const ledgerId = await debitSellerMallContribution(
    req,
    sellerId,
    body.contributionNgn,
    reference
  )

  let sellerJoin
  try {
    sellerJoin = await mallService.joinAsSeller({
      mallId: id,
      sellerId,
      contributionNgn: body.contributionNgn,
      productIds: body.productIds,
      redeemableId: body.redeemableId,
    })
    await mallService.setContributionLedger(id, sellerId, ledgerId)
  } catch (error) {
    await refundSellerMallContribution(
      req,
      sellerId,
      body.contributionNgn,
      reference
    )
    throw error
  }

  res.status(201).json({ sellerJoin })
}

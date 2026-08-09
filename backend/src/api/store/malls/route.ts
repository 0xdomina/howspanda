import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import {
  ContainerRegistrationKeys,
  MedusaError,
} from "@medusajs/framework/utils"
import MallModuleService from "../../../modules/mall/service"
import { MALL_MODULE } from "../../../modules/mall"
import type { CreateMallInput } from "../../../modules/mall/service"
import { requireSellerPermission } from "../../../lib/sellers/resolve-seller"

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

export const GET = async (
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) => {
  await requireSellerPermission(req, "malls")
  const sellerId = await resolveSellerId(req)
  const mallService = req.scope.resolve<MallModuleService>(MALL_MODULE)
  const malls = await mallService.listForSeller(sellerId)
  res.json({ malls })
}

export const POST = async (
  req: AuthenticatedMedusaRequest<CreateMallInput>,
  res: MedusaResponse
) => {
  await requireSellerPermission(req, "malls")
  const sellerId = await resolveSellerId(req)

  const body = req.validatedBody ?? (req.body as CreateMallInput)
  if (!body?.name || !body?.prizePoolNgn || !body?.prizeWinnerCount) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "name, prizePoolNgn, and prizeWinnerCount are required"
    )
  }

  const mallService = req.scope.resolve<MallModuleService>(MALL_MODULE)
  const mall = await mallService.createMall({
    ...body,
    createdBySellerId: sellerId,
  })

  res.status(201).json({ mall })
}

import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { REDEEMABLES_MODULE } from "../../../../../modules/redeemables"
import RedeemablesModuleService from "../../../../../modules/redeemables/service"
import { requireSellerOwner } from "../../../../../lib/sellers/resolve-seller"

export const POST = async (
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) => {
  const context = await requireSellerOwner(req)
  const sellerId = context.sellerId
  const redeemables =
    req.scope.resolve<RedeemablesModuleService>(REDEEMABLES_MODULE)

  const redeemable = await redeemables.cancelRedeemable(
    req.params.id,
    sellerId
  )
  res.json({ redeemable })
}

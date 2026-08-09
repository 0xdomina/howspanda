import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { z } from "@medusajs/framework/zod"
import { REDEEMABLES_MODULE } from "../../../../modules/redeemables"
import RedeemablesModuleService from "../../../../modules/redeemables/service"
import { PostRedeemInStoreSchema } from "../../../middlewares"
import { requireSellerPermission } from "../../../../lib/sellers/resolve-seller"

type PostBody = z.infer<typeof PostRedeemInStoreSchema>

// The buyer shows their code/QR; the seller's phone is the till. The
// response is the receipt: updated instrument + the redemption row.
export const POST = async (
  req: AuthenticatedMedusaRequest<PostBody>,
  res: MedusaResponse
) => {
  const context = await requireSellerPermission(req, "redeemables")
  const sellerId = context.sellerId
  const redeemables =
    req.scope.resolve<RedeemablesModuleService>(REDEEMABLES_MODULE)

  const result = await redeemables.redeemInStore(
    req.validatedBody.code,
    sellerId,
    { amount: req.validatedBody.amount }
  )
  res.json(result)
}

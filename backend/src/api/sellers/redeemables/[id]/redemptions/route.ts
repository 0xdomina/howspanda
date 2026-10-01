import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { MedusaError } from "@medusajs/framework/utils"
import { REDEEMABLES_MODULE } from "../../../../../modules/redeemables"
import RedeemablesModuleService from "../../../../../modules/redeemables/service"
import { requireSellerPermission } from "../../../../../lib/sellers/resolve-seller"

// Read-only audit trail: every spend on one card, newest first. Scoped to
// the owning seller — foreign ids are invisible (404, never 400).
export const GET = async (
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) => {
  const context = await requireSellerPermission(req, "redeemables")
  const redeemables =
    req.scope.resolve<RedeemablesModuleService>(REDEEMABLES_MODULE)

  const [redeemable] = await redeemables.listRedeemables({
    id: req.params.id,
  })
  if (!redeemable || redeemable.seller_id !== context.sellerId) {
    throw new MedusaError(MedusaError.Types.NOT_FOUND, "Code not found")
  }

  const redemptions = await redeemables.listRedemptions(
    { redeemable_id: redeemable.id },
    { order: { created_at: "DESC" } }
  )
  res.json({ redemptions })
}

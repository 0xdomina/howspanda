import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import {
  ContainerRegistrationKeys,
  MedusaError,
} from "@medusajs/framework/utils"
import { MARKETPLACE_MODULE } from "../../../modules/marketplace"
import MarketplaceModuleService from "../../../modules/marketplace/service"
import { requireSellerOwner } from "../../../lib/sellers/resolve-seller"

export const GET = async (
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) => {
  const context = await requireSellerOwner(req)
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)

  const { data: [sellerAdmin] } = await query.graph({
    entity: "seller_admin",
    fields: ["id", "seller.id"],
    filters: {
      id: [context.sellerAdminId],
    },
  })

  if (!sellerAdmin?.seller?.id) {
    throw new MedusaError(
      MedusaError.Types.UNAUTHORIZED,
      "Seller not found for authenticated actor"
    )
  }

  const marketplace =
    req.scope.resolve<MarketplaceModuleService>(MARKETPLACE_MODULE)

  // surface due pending lines immediately, so the balance a seller sees is
  // the balance a payout request would actually sweep
  await marketplace.releaseDueLines()
  const balances = await marketplace.getSellerBalance(sellerAdmin.seller.id)

  res.json({
    balances,
    return_window_days: marketplace.returnWindowDays(),
    minimum_ngn: marketplace.payoutMinNgn(),
  })
}

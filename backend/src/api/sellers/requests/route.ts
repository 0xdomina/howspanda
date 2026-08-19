import { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { PRODUCT_REQUESTS_MODULE } from "../../../modules/product-requests"
import ProductRequestsModuleService from "../../../modules/product-requests/service"
import { requireSellerPermission } from "../../../lib/sellers/resolve-seller"

export const GET = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  const { sellerId } = await requireSellerPermission(req, "requests")
  const requests = req.scope.resolve<ProductRequestsModuleService>(PRODUCT_REQUESTS_MODULE)
  res.json({ requests: await requests.listForSeller(sellerId) })
}

import { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { PRODUCT_REQUESTS_MODULE } from "../../../modules/product-requests"
import ProductRequestsModuleService from "../../../modules/product-requests/service"

export const GET = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  const requests = req.scope.resolve<ProductRequestsModuleService>(PRODUCT_REQUESTS_MODULE)
  res.json({ requests: await requests.listForBuyer(req.auth_context.actor_id as string) })
}

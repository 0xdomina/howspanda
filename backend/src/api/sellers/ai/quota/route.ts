import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { AI_MODULE } from "../../../../modules/ai"
import AiModuleService from "../../../../modules/ai/service"
import { resolveSeller } from "../../../../lib/ai/seller-context"
import { requireSellerPermission } from "../../../../lib/sellers/resolve-seller"

export const GET = async (
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) => {
  await requireSellerPermission(req, "ai")
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const aiService: AiModuleService = req.scope.resolve(AI_MODULE)

  const seller = await resolveSeller(query, req.auth_context.actor_id)
  const quota = await aiService.getQuotaStatus(seller.seller_id)

  res.json({ quota })
}

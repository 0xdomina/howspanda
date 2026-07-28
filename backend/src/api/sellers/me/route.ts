import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"

export const GET = async (
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) => {
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)

  const { data: [sellerAdmin] } = await query.graph({
    entity: "seller_admin",
    fields: ["id", "first_name", "last_name", "email", "seller.*"],
    filters: {
      id: [req.auth_context.actor_id],
    },
  })

  res.json({
    seller_admin: sellerAdmin,
  })
}

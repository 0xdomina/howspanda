import { AuthenticatedMedusaRequest } from "@medusajs/framework/http"
import {
  ContainerRegistrationKeys,
  MedusaError,
} from "@medusajs/framework/utils"

export async function resolveSellerId(
  req: AuthenticatedMedusaRequest
): Promise<string> {
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  // Unified accounts authenticate with a customer-actor JWT whose actor_id is
  // a customer id, not a seller_admin id — those resolve through the linked
  // auth identity. Legacy seller tokens may carry an empty actor_id, so they
  // fall back to the auth identity too.
  const filters =
    req.auth_context?.actor_type === "customer" || !req.auth_context?.actor_id
      ? { auth_identity_id: [req.auth_context.auth_identity_id] }
      : { id: [req.auth_context.actor_id] }
  const { data: [sellerAdmin] } = await query.graph({
    entity: "seller_admin",
    fields: ["id", "seller.id"],
    filters,
  })
  if (!sellerAdmin?.seller?.id) {
    throw new MedusaError(
      MedusaError.Types.UNAUTHORIZED,
      "Seller not found for authenticated actor"
    )
  }
  return sellerAdmin.seller.id
}

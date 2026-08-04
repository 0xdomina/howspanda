import { AuthenticatedMedusaRequest } from "@medusajs/framework/http"
import {
  ContainerRegistrationKeys,
  MedusaError,
} from "@medusajs/framework/utils"

/**
 * Resolves the Seller a seller-authenticated actor administers. The seller JWT
 * actor is a seller_admin id; the owning seller is looked up through it.
 */
export async function resolveSellerId(
  req: AuthenticatedMedusaRequest
): Promise<string> {
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)

  const { data: [sellerAdmin] } = await query.graph({
    entity: "seller_admin",
    fields: ["id", "seller.id"],
    filters: {
      id: [req.auth_context.actor_id],
    },
  })

  if (!sellerAdmin?.seller?.id) {
    throw new MedusaError(
      MedusaError.Types.UNAUTHORIZED,
      "Seller not found for authenticated actor"
    )
  }

  return sellerAdmin.seller.id
}

/** Resolves the public profile of a store by handle (id + display fields). */
export async function resolveSellerByHandle(
  req: AuthenticatedMedusaRequest,
  handle: string
): Promise<{ id: string; name: string; handle: string }> {
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)

  const { data: [seller] } = await query.graph({
    entity: "seller",
    fields: ["id", "name", "handle"],
    filters: { handle },
  })

  if (!seller) {
    throw new MedusaError(MedusaError.Types.NOT_FOUND, "Store not found")
  }

  return seller
}

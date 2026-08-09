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

  const filters =
    req.auth_context?.actor_type === "customer"
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

export type SellerContext = {
  sellerAdminId: string
  sellerId: string
  role: "owner" | "staff"
  email: string | null
  phone: string | null
}

/** Resolves the acting seller admin row plus the seller it administers. */
export async function resolveSellerContext(
  req: AuthenticatedMedusaRequest
): Promise<SellerContext> {
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)

  const filters =
    req.auth_context?.actor_type === "customer"
      ? { auth_identity_id: [req.auth_context.auth_identity_id] }
      : { id: [req.auth_context.actor_id] }

  const { data: [sellerAdmin] } = await query.graph({
    entity: "seller_admin",
    fields: ["id", "email", "phone", "role", "seller.id"],
    filters,
  })

  if (!sellerAdmin?.seller?.id) {
    throw new MedusaError(
      MedusaError.Types.UNAUTHORIZED,
      "Seller not found for authenticated actor"
    )
  }

  return {
    sellerAdminId: sellerAdmin.id,
    sellerId: sellerAdmin.seller.id,
    role: sellerAdmin.role ?? "owner",
    email: sellerAdmin.email ?? null,
    phone: sellerAdmin.phone ?? null,
  }
}

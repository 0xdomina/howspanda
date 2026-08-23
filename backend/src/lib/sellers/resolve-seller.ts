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

  // Unified accounts authenticate with a customer-actor JWT whose actor_id is
  // a customer id, not a seller_admin id — those resolve through the linked
  // auth identity. Legacy seller-actor tokens may carry an empty actor_id,
  // so they fall back to the auth identity too.
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
  permissions: SellerPermission[]
  email: string | null
  phone: string | null
}

export const SELLER_PERMISSION_KEYS = [
  "products",
  "orders",
  "delivery",
  "broadcasts",
  "followers",
  "reviews",
  "analytics",
  "malls",
  "referrals",
  "ai",
  "redeemables",
  "requests",
] as const

export type SellerPermission = (typeof SELLER_PERMISSION_KEYS)[number]

// Legacy staff accounts keep the original day-to-day access. Sensitive
// management areas (settings, team, money and redeemable creation) are never
// part of this default.
export const DEFAULT_STAFF_PERMISSIONS: SellerPermission[] = [
  "products",
  "orders",
  "delivery",
  "broadcasts",
]

export const normalizeSellerPermissions = (
  value: unknown
): SellerPermission[] => {
  if (!Array.isArray(value)) return [...DEFAULT_STAFF_PERMISSIONS]
  return value.filter((item): item is SellerPermission =>
    (SELLER_PERMISSION_KEYS as readonly string[]).includes(String(item))
  )
}

export const sellerHasPermission = (
  context: SellerContext,
  permission: SellerPermission
) => context.role === "owner" || context.permissions.includes(permission)

export async function requireSellerPermission(
  req: AuthenticatedMedusaRequest,
  permission: SellerPermission
) {
  const context = await resolveSellerContext(req)
  if (!sellerHasPermission(context, permission)) {
    throw new MedusaError(
      MedusaError.Types.UNAUTHORIZED,
      "You do not have permission to access this store area."
    )
  }
  return context
}

export async function requireSellerOwner(req: AuthenticatedMedusaRequest) {
  const context = await resolveSellerContext(req)
  if (context.role !== "owner") {
    throw new MedusaError(
      MedusaError.Types.UNAUTHORIZED,
      "Only the store owner can perform this action."
    )
  }
  return context
}

/** Resolves the acting seller admin row plus the seller it administers. */
export async function resolveSellerContext(
  req: AuthenticatedMedusaRequest
): Promise<SellerContext> {
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)

  // Unified accounts authenticate with a customer-actor JWT whose actor_id is
  // a customer id, not a seller_admin id — those resolve through the linked
  // auth identity. Legacy seller-actor tokens may carry an empty actor_id,
  // so they fall back to the auth identity too.
  const filters =
    req.auth_context?.actor_type === "customer" || !req.auth_context?.actor_id
      ? { auth_identity_id: [req.auth_context.auth_identity_id] }
      : { id: [req.auth_context.actor_id] }

  const { data: [sellerAdmin] } = await query.graph({
    entity: "seller_admin",
    fields: ["id", "email", "phone", "role", "permissions", "seller.id"],
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
    permissions: normalizeSellerPermissions(sellerAdmin.permissions),
    email: sellerAdmin.email ?? null,
    phone: sellerAdmin.phone ?? null,
  }
}

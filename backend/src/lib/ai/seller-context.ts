import { MedusaError } from "@medusajs/framework/utils"

// Hard per-seller isolation: every builder takes the seller identity that
// was resolved from the authenticated actor and filters strictly by it.

export type SellerIdentity = {
  seller_admin_id: string
  seller_id: string
  seller_name: string
}

type Query = {
  graph: (config: any) => Promise<{ data: any[] }>
}

export type SellerAuthRef = {
  actor_type?: string | null
  actor_id?: string | null
  auth_identity_id?: string | null
}

export async function resolveSeller(
  query: Query,
  auth: SellerAuthRef | string
): Promise<SellerIdentity> {
  // Unified accounts authenticate with a customer-actor JWT whose actor_id is
  // a customer id, not a seller_admin id — those resolve through the linked
  // auth identity. Legacy seller tokens may carry an empty actor_id, so they
  // fall back to the auth identity too.
  const authRef: SellerAuthRef =
    typeof auth === "string" ? { actor_id: auth } : auth
  const filters =
    authRef.actor_type === "customer" || !authRef.actor_id
      ? { auth_identity_id: [authRef.auth_identity_id] }
      : { id: [authRef.actor_id] }

  const {
    data: [sellerAdmin],
  } = await query.graph({
    entity: "seller_admin",
    fields: ["id", "seller.id", "seller.name"],
    filters,
  })

  if (!sellerAdmin?.seller) {
    throw new MedusaError(
      MedusaError.Types.UNAUTHORIZED,
      "Seller not found for authenticated actor"
    )
  }

  return {
    seller_admin_id: sellerAdmin.id,
    seller_id: sellerAdmin.seller.id,
    seller_name: sellerAdmin.seller.name,
  }
}

export async function getSellerProducts(
  query: Query,
  sellerId: string,
  limit = 50
): Promise<any[]> {
  const {
    data: [seller],
  } = await query.graph({
    entity: "seller",
    fields: [
      "products.id",
      "products.title",
      "products.status",
      "products.variants.title",
      "products.variants.prices.amount",
      "products.variants.prices.currency_code",
    ],
    filters: { id: sellerId },
  })

  return (seller?.products ?? []).filter(Boolean).slice(0, limit)
}

export async function getSellerOrders(
  query: Query,
  sellerId: string,
  limit = 30
): Promise<any[]> {
  const {
    data: [seller],
  } = await query.graph({
    entity: "seller",
    fields: ["orders.id"],
    filters: { id: sellerId },
  })

  const orderIds = (seller?.orders ?? [])
    .filter(Boolean)
    .map((o: any) => o.id)
    .slice(0, limit)

  if (!orderIds.length) {
    return []
  }

  const { data: orders } = await query.graph({
    entity: "order",
    fields: [
      "id",
      "display_id",
      "status",
      "created_at",
      "currency_code",
      "total",
      "region.name",
      "items.title",
      "items.quantity",
      "items.total",
    ],
    filters: { id: orderIds },
  })

  return orders.map((o: any) => ({ ...o, region_name: o.region?.name ?? "Unspecified" }))
}

export async function getSellerCommissionLines(
  query: Query,
  sellerId: string
): Promise<any[]> {
  const {
    data: [seller],
  } = await query.graph({
    entity: "seller",
    fields: ["commission_lines.*"],
    filters: { id: sellerId },
  })

  return (seller?.commission_lines ?? []).filter(Boolean)
}

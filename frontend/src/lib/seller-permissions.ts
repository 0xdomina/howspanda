export const SELLER_PERMISSION_LABELS = {
  products: "Products",
  orders: "Orders",
  delivery: "Delivery",
  broadcasts: "Inbox & broadcasts",
  followers: "Followers",
  reviews: "Reviews",
  analytics: "Analytics",
  malls: "Malls",
  referrals: "Referrals",
  ai: "AI tools",
  redeemables: "Redeemables (view & redeem)",
} as const

export type SellerPermission = keyof typeof SELLER_PERMISSION_LABELS

export const SELLER_PERMISSION_KEYS = Object.keys(
  SELLER_PERMISSION_LABELS
) as SellerPermission[]

export const DEFAULT_STAFF_PERMISSIONS: SellerPermission[] = [
  "products",
  "orders",
  "delivery",
  "broadcasts",
]

export const sellerHasPermission = (
  seller: { role?: "owner" | "staff"; permissions?: SellerPermission[] } | null,
  permission: SellerPermission
) =>
  Boolean(
    seller &&
      (seller.role === "owner" || seller.permissions?.includes(permission))
  )

import { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"

// FCCPA 2018 (s.122/s.129) + EU 2011/83/EU Art.16 guidance. Enforcement is
// the per-product `metadata.non_returnable` flag a seller sets at listing;
// this list is documentation/storefront copy, not runtime matching.
export const NON_RETURNABLE_CATEGORY_GUIDANCE = [
  "perishables (food, drinks, fresh produce, flowers)",
  "sealed hygiene & personal care once unsealed (perfumes, cosmetics, soaps, creams, underwear, swimwear)",
  "custom-made or personalized goods",
  "digital goods once delivered (software, downloads, vouchers, tickets)",
  "sealed audio/video/software once unsealed",
] as const

/**
 * Non-returnable only when EVERY item's product is flagged — mixed orders
 * stay returnable (buyer-protective). Defect claims are never blocked by
 * this flag; they go through the admin reversal path.
 */
export async function isOrderNonReturnable(
  container: MedusaContainer,
  orderId: string
): Promise<boolean> {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const { data: orders } = await query.graph({
    entity: "order",
    fields: ["id", "items.product_id"],
    filters: { id: orderId },
  })
  const productIds = (orders[0]?.items ?? [])
    .map((item) => item?.product_id)
    .filter((id): id is string => Boolean(id))
  if (!productIds.length) {
    return false
  }
  const { data: products } = await query.graph({
    entity: "product",
    fields: ["id", "metadata"],
    filters: { id: productIds },
  })
  return (
    products.length > 0 &&
    products.every((p) => p.metadata?.non_returnable === true)
  )
}

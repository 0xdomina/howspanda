import {
  ContainerRegistrationKeys,
  MedusaError,
} from "@medusajs/framework/utils"
import type { MedusaRequest } from "@medusajs/framework/http"

type Scope = MedusaRequest["scope"]

/**
 * Per-seller crypto payment gate.
 *
 * A store owner can close the crypto-usdc rail for their own store
 * (Seller.crypto_payments_enabled = false). A cart aggregates products from
 * potentially several sellers, so the cart is allowed to use crypto only when
 * EVERY seller represented in the cart has crypto enabled. Any single seller
 * that turned it off closes the rail for the whole cart.
 */
export async function isCryptoGatedForCart(
  scope: Scope,
  cartId: string
): Promise<boolean> {
  const query = scope.resolve(ContainerRegistrationKeys.QUERY)
  const { data: [cart] } = await query.graph({
    entity: "cart",
    fields: [
      "items.product.seller.id",
      "items.product.seller.crypto_payments_enabled",
    ],
    filters: { id: cartId },
  })

  if (!cart) {
    return false
  }

  const sellers = (cart.items ?? []).map(
    (item: any) => item.product?.seller
  )

  return sellers.some(
    (s: any) => s?.crypto_payments_enabled === false
  )
}

export async function assertCryptoAllowedForCart(
  scope: Scope,
  cartId: string
): Promise<void> {
  const gated = await isCryptoGatedForCart(scope, cartId)
  if (gated) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "One or more stores in this cart have disabled crypto payments."
    )
  }
}

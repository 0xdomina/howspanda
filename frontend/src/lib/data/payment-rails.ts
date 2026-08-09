"use server"

import { sdk } from "@lib/config"
import { getAuthHeaders } from "./cookies"
import type { PaymentRailsResponse, RailStatus } from "./payment-rails-utils"

export type { PaymentRailsResponse, RailStatus }

/**
 * Public rail status from the backend: which rails are on, and their mode.
 * The storefront gates its payment / payout / withdrawal UI on the `enabled`
 * flags. Falls back to empty (treat everything as available) if the fetch
 * fails, so a backend hiccup can never hide every payment method.
 *
 * When a `cartId` is passed, the backend additionally applies the per-seller
 * crypto gate: if any seller in that cart disabled crypto payments, the
 * crypto-usdc rail is reported off for this cart.
 */
export const getPaymentRails = async (cartId?: string): Promise<RailStatus[]> => {
  const headers = {
    ...(await getAuthHeaders()),
  }

  try {
    const res = await sdk.client.fetch<PaymentRailsResponse>(
      `/store/payment-rails`,
      {
        method: "GET",
        headers,
        query: cartId ? { cart_id: cartId } : undefined,
        cache: "no-store",
      }
    )
    return res?.rails ?? []
  } catch {
    return []
  }
}

import "server-only"

import { sdk } from "@lib/config"
import { getAuthHeaders } from "./cookies"
import type { KycProfileView } from "./kyc"

/**
 * The authenticated user's platform-wide KYC state, read off their profile
 * (/store/kyc/me). KYC is account data and is never resolved from an arbitrary
 * email or phone query.
 *
 * Server-only: lives in its own module (not in kyc.ts) because the kyc.ts
 * module is also imported by client components, which cannot reach the
 * server-only cookies helper.
 */
export const retrieveMyKyc = async (
  email?: string | null,
  phone?: string | null
): Promise<KycProfileView | null> => {
  void email
  void phone
  try {
    const headers = await getAuthHeaders()
    return await sdk.client
      .fetch<{ kyc: KycProfileView | null }>("/store/kyc/me", {
        method: "GET",
        headers,
        cache: "no-store",
      })
      .then(({ kyc }) => kyc ?? null)
  } catch {
    return null
  }
}

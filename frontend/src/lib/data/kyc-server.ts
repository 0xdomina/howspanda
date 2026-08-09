import "server-only"

import { sdk } from "@lib/config"
import { getAuthHeaders } from "./cookies"
import { retrieveKycStatus } from "./kyc"
import type { KycProfileView } from "./kyc"

/**
 * The authenticated user's platform-wide KYC state, read off their profile
 * (/store/kyc/me). Falls back to the public email/phone status lookup for
 * unauthenticated or seller contexts.
 *
 * Server-only: lives in its own module (not in kyc.ts) because the kyc.ts
 * module is also imported by client components, which cannot reach the
 * server-only cookies helper.
 */
export const retrieveMyKyc = async (
  email?: string | null,
  phone?: string | null
): Promise<KycProfileView | null> => {
  try {
    const headers = await getAuthHeaders()
    if ("authorization" in headers) {
      const kyc = await sdk.client
        .fetch<{ kyc: KycProfileView | null }>("/store/kyc/me", {
          method: "GET",
          headers,
          cache: "no-store",
        })
        .then(({ kyc }) => kyc)
        .catch(() => null)
      if (kyc) return kyc
    }
  } catch {
    // fall through to the email/phone lookup below
  }
  return retrieveKycStatus(email, phone)
}

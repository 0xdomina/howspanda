"use server"

import { sdk } from "@lib/config"
import { getAuthHeaders } from "./cookies"
import type { KycProfileView } from "./kyc"

export type KycProfileInput = {
  first_name?: string
  last_name?: string
  phone?: string
  other_name?: string
  address?: string
  country?: string
  state?: string
  city?: string
  postal_code?: string
}

// Save the personal-profile rung of the KYC ladder for the signed-in user.
// Authenticated server action: the owner is the JWT actor, never the body.
export const saveMyKycProfile = async (
  input: KycProfileInput
): Promise<{
  ok: boolean
  profile: KycProfileView | null
  error: string | null
}> => {
  try {
    const headers = await getAuthHeaders()
    const res = await sdk.client.fetch<{ profile: KycProfileView }>(
      "/store/kyc/profile",
      {
        method: "POST",
        headers,
        body: {
          first_name: input.first_name?.trim() || undefined,
          last_name: input.last_name?.trim() || undefined,
          phone: input.phone?.trim() || undefined,
          other_name: input.other_name?.trim() || undefined,
          address: input.address?.trim() || undefined,
          country: input.country?.trim() || undefined,
          state: input.state?.trim() || undefined,
          city: input.city?.trim() || undefined,
          postal_code: input.postal_code?.trim() || undefined,
        },
      }
    )
    return { ok: true, profile: res.profile ?? null, error: null }
  } catch (error: any) {
    return { ok: false, profile: null, error: error?.message ?? error?.toString() }
  }
}

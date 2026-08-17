import { sdk } from "@lib/config"

export type KycLevel =
  | "unverified"
  | "email_verified"
  | "profile_completed"
  | "identity_verified"

export type KycProfileView = {
  email: string | null
  phone: string | null
  level: KycLevel
  email_verified: boolean
  phone_verified: boolean
  first_name: string | null
  last_name: string | null
  other_name: string | null
  address: string | null
  country: string | null
  state: string | null
  city: string | null
  postal_code: string | null
  id_type: string | null
  id_tail: string | null
  id_status: string
  email_verified_at: string | null
  phone_verified_at: string | null
  id_submitted_at: string | null
  id_reviewed_at: string | null
  id_document_uploaded: boolean
  id_document_mime: string | null
}

// Server-side feature toggles (GET /store/features). The UI shows/hides the
// NIN verification step based on nin_verification so flipping the env flag on
// the backend surfaces the step on the next page load — no deploy needed.
export type KycFeatures = {
  nin_verification: boolean
  product_video: boolean
}

export const retrieveFeatures = async (): Promise<KycFeatures> => {
  try {
    return await sdk.client
      .fetch<{ features: KycFeatures }>("/store/features", {
        method: "GET",
        cache: "no-store",
      })
      .then(({ features }) => ({
        nin_verification: features?.nin_verification ?? false,
        product_video: features?.product_video ?? false,
      }))
      .catch(() => ({ nin_verification: false, product_video: false }))
  } catch {
    return { nin_verification: false, product_video: false }
  }
}

// The fields that must be present for the ladder to count the profile complete
// (mirrors the backend's PROFILE_REQUIRED_FIELDS — postal code stays optional).
export const PROFILE_REQUIRED_FIELDS = [
  "first_name",
  "last_name",
  "address",
  "country",
  "state",
  "city",
] as const

export const profileComplete = (kyc: KycProfileView | null): boolean =>
  !!kyc && PROFILE_REQUIRED_FIELDS.every((f) => !!kyc[f]?.trim())

const PROFILE_FIELDS =
  "id, email, first_name, last_name, phone, addresses.*"

export const retrieveKycStatus = async (
  email?: string | null,
  phone?: string | null
): Promise<KycProfileView | null> => {
  try {
    if (!email && !phone) return null

    const query: Record<string, string> = {}
    if (email) query.email = email
    if (phone) query.phone = phone

    return await sdk.client
      .fetch<{ profile: KycProfileView }>("/kyc/status", {
        method: "GET",
        query,
        cache: "no-store",
      })
      .then(({ profile }) => profile)
      .catch(() => null)
  } catch {
    return null
  }
}

export { PROFILE_FIELDS }

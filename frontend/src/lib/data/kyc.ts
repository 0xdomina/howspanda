import { sdk } from "@lib/config"

export type KycLevel = "unverified" | "phone_verified" | "identity_verified"

export type KycProfileView = {
  email: string | null
  phone: string | null
  level: KycLevel
  email_verified: boolean
  phone_verified: boolean
  id_type: string | null
  id_tail: string | null
  id_status: string
  email_verified_at: string | null
  phone_verified_at: string | null
  id_submitted_at: string | null
  id_reviewed_at: string | null
}

const PROFILE_FIELDS =
  "id, email, first_name, last_name, phone, addresses.*"

export const retrieveKycStatus = async (
  email?: string,
  phone?: string
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

export const requestKycOtp = async (input: {
  email?: string
  phone?: string
  channel: "email" | "phone"
  destination: string
}): Promise<{ ok: boolean; code: string | null; error: string | null }> => {
  try {
    const res = await sdk.client.fetch<{ ok: boolean; code: string | null }>(
      "/kyc/request",
      {
        method: "POST",
        body: input,
      }
    )
    return { ok: true, code: res.code ?? null, error: null }
  } catch (error: any) {
    return { ok: false, code: null, error: error?.message ?? error?.toString() }
  }
}

export const verifyKycOtp = async (input: {
  email?: string
  phone?: string
  channel: "email" | "phone"
  destination: string
  code: string
}): Promise<{ ok: boolean; profile: KycProfileView | null; error: string | null }> => {
  try {
    const res = await sdk.client.fetch<{ ok: boolean; profile: KycProfileView }>(
      "/kyc/verify",
      {
        method: "POST",
        body: input,
      }
    )
    return { ok: true, profile: res.profile, error: null }
  } catch (error: any) {
    return { ok: false, profile: null, error: error?.message ?? error?.toString() }
  }
}

export const submitKycIdentity = async (input: {
  email?: string
  phone?: string
  id_type: "nin"
  id_number: string
}): Promise<{ ok: boolean; profile: KycProfileView | null; error: string | null }> => {
  try {
    const res = await sdk.client.fetch<{ ok: boolean; profile: KycProfileView }>(
      "/kyc/identity",
      {
        method: "POST",
        body: input,
      }
    )
    return { ok: true, profile: res.profile, error: null }
  } catch (error: any) {
    return { ok: false, profile: null, error: error?.message ?? error?.toString() }
  }
}

export { PROFILE_FIELDS }

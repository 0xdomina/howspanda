import { sdk } from "@lib/config"

export type OtpPurpose = "signup" | "reset"

export const requestAuthOtp = async (input: {
  email: string
  purpose: OtpPurpose
}): Promise<{ ok: boolean; code: string | null; error: string | null }> => {
  try {
    const res = await sdk.client.fetch<{ ok: boolean; code: string | null }>(
      "/auth/otp/request",
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

export const verifyAuthOtp = async (input: {
  email: string
  purpose: OtpPurpose
  code: string
}): Promise<{ ok: boolean; proof: string | null; error: string | null }> => {
  try {
    const res = await sdk.client.fetch<{ ok: boolean; proof: string | null }>(
      "/auth/otp/verify",
      {
        method: "POST",
        body: input,
      }
    )
    return { ok: true, proof: res.proof ?? null, error: null }
  } catch (error: any) {
    return { ok: false, proof: null, error: error?.message ?? error?.toString() }
  }
}

export const resetPasswordOtp = async (input: {
  email: string
  code: string
  newPassword: string
}): Promise<{ ok: boolean; error: string | null }> => {
  try {
    await sdk.client.fetch<{ ok: boolean }>("/auth/otp/reset", {
      method: "POST",
      body: input,
    })
    return { ok: true, error: null }
  } catch (error: any) {
    return { ok: false, error: error?.message ?? error?.toString() }
  }
}

export const assertSignupProof = async (input: {
  email: string
  proof: string
}): Promise<{ ok: boolean; error: string | null }> => {
  try {
    await sdk.client.fetch<{ ok: boolean }>("/auth/otp/assert", {
      method: "POST",
      body: input,
    })
    return { ok: true, error: null }
  } catch (error: any) {
    return { ok: false, error: error?.message ?? error?.toString() }
  }
}

"use server"

// All four helpers are invoked from client components (register,
// forgot-password). Marking the module "use server" keeps every request
// server-side: the browser never talks to MEDUSA_BACKEND_URL directly, so
// storefront deployments never depend on backend AUTH_CORS containing the
// storefront origin.

import { sdk } from "@lib/config"

export type OtpPurpose = "signup" | "reset"

export type OtpResult = {
  ok: boolean
  code: string | null
  error: string | null
  /** Backend unreachable (cold start / 5xx / timeout) — caller may offer offline flow. */
  warming?: boolean
}

// The Medusa JS SDK throws `Error: <none>` when the backend answers with a
// non-JSON body (Cloudflare 521 / gateway HTML). Never surface that to users.
function toHumanError(error: any): { error: string; warming: boolean } {
  const raw = String(error?.message ?? error ?? "")
  const warming =
    error?.name === "AbortError" ||
    [502, 503, 504, 521].includes(Number(error?.status)) ||
    /<none>|abort|timed out|timeout|warming|ready["']?\s*:\s*false|booting|fetch failed|load failed/i.test(
      raw
    )
  if (warming) {
    return {
      error:
        "Our servers are waking up. Please wait a moment and try again — your details are safe.",
      warming: true,
    }
  }
  return { error: raw || "Something went wrong. Please try again.", warming: false }
}

export const requestAuthOtp = async (input: {
  email: string
  purpose: OtpPurpose
}): Promise<OtpResult> => {
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
    const { error: message, warming } = toHumanError(error)
    return { ok: false, code: null, error: message, warming }
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

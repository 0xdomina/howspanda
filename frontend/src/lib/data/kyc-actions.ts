"use server"

import { sdk } from "@lib/config"
import { getAuthHeaders } from "./cookies"
import type { KycProfileView } from "./kyc"

export const requestKycOtp = async (input: {
  email: string
  channel: "email"
  destination: string
}): Promise<{ ok: boolean; code: string | null; error: string | null }> => {
  try {
    const headers = await getAuthHeaders()
    const res = await sdk.client.fetch<{ ok: boolean; code: string | null }>(
      "/kyc/request",
      { method: "POST", headers, body: input }
    )
    return { ok: true, code: res.code ?? null, error: null }
  } catch (error: any) {
    return { ok: false, code: null, error: error?.message ?? error?.toString() }
  }
}

export const verifyKycOtp = async (input: {
  email: string
  channel: "email"
  destination: string
  code: string
}): Promise<{ ok: boolean; profile: KycProfileView | null; error: string | null }> => {
  try {
    const headers = await getAuthHeaders()
    const res = await sdk.client.fetch<{ ok: boolean; profile: KycProfileView }>(
      "/kyc/verify",
      { method: "POST", headers, body: input }
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
  document?: File
  extracted?: {
    id_number?: string
    first_name?: string
    last_name?: string
    other_name?: string
    date_of_birth?: string
    country?: string
    state?: string
    city?: string
    address?: string
  }
}): Promise<{ ok: boolean; profile: KycProfileView | null; error: string | null }> => {
  try {
    const body = new FormData()
    body.append("id_type", input.id_type)
    body.append("id_number", input.id_number)
    if (input.document) body.append("document", input.document, input.document.name)
    if (input.extracted) body.append("extracted", JSON.stringify(input.extracted))
    const res = await sdk.client.fetch<{ ok: boolean; profile: KycProfileView }>(
      "/kyc/identity",
      { method: "POST", headers: { "content-type": null } as any, body: body as any }
    )
    return { ok: true, profile: res.profile, error: null }
  } catch (error: any) {
    return { ok: false, profile: null, error: error?.message ?? error?.toString() }
  }
}

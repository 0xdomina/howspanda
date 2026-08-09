"use server"

import { sdk } from "@lib/config"
import { getAuthHeaders } from "./cookies"

export async function requestEmailChange(input: {
  newEmail: string
  currentPassword: string
}): Promise<{ ok: boolean; code: string | null; error: string | null }> {
  try {
    const response = await sdk.client.fetch<{ ok: boolean; code: string | null }>(
      "/auth/email/change/request",
      {
        method: "POST",
        headers: await getAuthHeaders(),
        body: { new_email: input.newEmail, current_password: input.currentPassword },
      }
    )
    return { ok: true, code: response.code ?? null, error: null }
  } catch (error: any) {
    return { ok: false, code: null, error: error?.message ?? String(error) }
  }
}

export async function confirmEmailChange(input: {
  newEmail: string
  code: string
}): Promise<{ ok: boolean; email: string | null; error: string | null }> {
  try {
    const response = await sdk.client.fetch<{ ok: boolean; email: string }>(
      "/auth/email/change/confirm",
      {
        method: "POST",
        headers: await getAuthHeaders(),
        body: { new_email: input.newEmail, code: input.code },
      }
    )
    return { ok: true, email: response.email, error: null }
  } catch (error: any) {
    return { ok: false, email: null, error: error?.message ?? String(error) }
  }
}

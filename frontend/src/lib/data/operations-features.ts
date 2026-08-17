"use server"

import { MEDUSA_BACKEND_URL } from "@lib/config"

export type OperationFeature = {
  key: "malls" | "nin_verification"
  label: string
  description: string
  enabled: boolean
  default_enabled: boolean
  source: "runtime"
}

type OperationFeaturesResponse = { features: OperationFeature[] }

function authHeaders(accessToken: string): Record<string, string> {
  return {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
  }
}

// Server-only helpers for the separate Vercel Operations Console. The
// operator token never needs to enter public browser code.
export async function listOperationFeatures(
  accessToken: string
): Promise<OperationFeature[]> {
  const response = await fetch(`${MEDUSA_BACKEND_URL}/admin/features`, {
    headers: authHeaders(accessToken),
    cache: "no-store",
  })
  if (!response.ok) throw new Error("Could not load operations settings")
  return ((await response.json()) as OperationFeaturesResponse).features ?? []
}

export async function setOperationFeature(
  accessToken: string,
  key: OperationFeature["key"],
  enabled: boolean
): Promise<OperationFeature[]> {
  const response = await fetch(`${MEDUSA_BACKEND_URL}/admin/features/${key}`, {
    method: "PATCH",
    headers: authHeaders(accessToken),
    body: JSON.stringify({ enabled }),
    cache: "no-store",
  })
  if (!response.ok) throw new Error("Could not update operations setting")
  return ((await response.json()) as OperationFeaturesResponse).features ?? []
}

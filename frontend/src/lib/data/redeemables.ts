"use server"

import { sdk } from "@lib/config"
import { getAuthHeaders } from "@lib/data/cookies"

export type OwnedRedeemable = {
  id: string
  seller_id: string
  type: "gift_card" | "voucher" | "ticket"
  code: string
  status: string
  title: string
  design_variant?: string | null
  background_image?: string | null
  accent_color?: string | null
  message?: string | null
  face_value?: number | string | null
  balance?: number | string | null
  discount_type?: string | null
  discount_value?: number | null
  expires_at?: string | null
  event_name?: string | null
  venue_name?: string | null
  venue_address?: string | null
  event_starts_at?: string | null
  event_ends_at?: string | null
  store?: { name: string; handle: string; logo: string | null } | null
}

export const listMyRedeemables = async (): Promise<OwnedRedeemable[]> => {
  const headers = await getAuthHeaders()
  if (!("authorization" in headers)) return []

  try {
    const result = await sdk.client.fetch<{ redeemables: OwnedRedeemable[] }>(
      "/store/redeemables/mine",
      { method: "GET", headers, cache: "no-store" }
    )
    return result.redeemables ?? []
  } catch {
    return []
  }
}

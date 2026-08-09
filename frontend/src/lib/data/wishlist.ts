"use server"

import { sdk } from "@lib/config"
import { getAuthHeaders } from "./cookies"

export type PersistedWishlistItem = {
  id: string
  handle?: string
  title: string
  thumbnail?: string | null
  price?: string
}

const hasAuth = (headers: { authorization?: string }): boolean =>
  Boolean(headers.authorization)

export async function loadWishlist(): Promise<PersistedWishlistItem[] | null> {
  const headers = await getAuthHeaders()
  if (!hasAuth(headers)) return null

  try {
    const response = await sdk.client.fetch<{ items: PersistedWishlistItem[] }>(
      "/store/wishlist",
      { method: "GET", headers, cache: "no-store" }
    )
    return response.items ?? []
  } catch {
    return null
  }
}

export async function syncWishlist(
  items: PersistedWishlistItem[]
): Promise<{ ok: boolean; items?: PersistedWishlistItem[] }> {
  const headers = await getAuthHeaders()
  if (!hasAuth(headers)) return { ok: false }

  try {
    const response = await sdk.client.fetch<{ items: PersistedWishlistItem[] }>(
      "/store/wishlist",
      { method: "PUT", headers, body: { items } }
    )
    return { ok: true, items: response.items ?? [] }
  } catch {
    return { ok: false }
  }
}

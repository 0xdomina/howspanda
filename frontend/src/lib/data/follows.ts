"use server"

import { sdk } from "@lib/config"
import { revalidateTag } from "next/cache"
import { getAuthHeaders, getCacheTag } from "./cookies"
import {
  getSellerAuthHeaders,
  getSellerCacheTag,
} from "./seller-cookies"

type AuthHeaders = { authorization: string } | {}

const hasAuth = (headers: AuthHeaders): headers is { authorization: string } =>
  "authorization" in headers

// ── public store profile ────────────────────────────────────────────────

export type StoreBroadcastSummary = {
  id: string
  type: "general" | "product" | "offer" | "voucher" | "giveaway"
  title: string
  body: string
  created_at?: string
  giveaway_claims_count?: number
}

export type StoreProfile = {
  seller: {
    name: string
    handle: string
    logo: string | null
    cover_image: string | null
    description: string | null
    accent_color: string
    theme: "sunset" | "midnight" | "mint" | "candy" | "cobalt"
    verification_status: string
  }
  follower_count: number
  followed_by_viewer: boolean
  products: { id: string; title: string; handle: string; thumbnail: string | null }[]
  redeemables: {
    id: string
    type: "gift_card" | "voucher" | "ticket"
    title: string
    design_variant?: "sunset" | "midnight" | "mint" | "candy" | "cobalt"
    background_image?: string | null
    accent_color?: string | null
    message?: string | null
    event_name?: string | null
    venue_name?: string | null
    venue_address?: string | null
    event_starts_at?: string | null
    event_ends_at?: string | null
    price?: number | string | null
    face_value?: number | string | null
    balance?: number | string | null
    discount_type?: string | null
    discount_value?: number | null
    expires_at?: string | null
    product_handle?: string | null
  }[]
  trust: { score: number | null; tier: string; review_count: number; avg_rating: number }
  broadcasts: StoreBroadcastSummary[]
}

export const getStoreProfile = async (
  handle: string
): Promise<StoreProfile | null> => {
  try {
    const headers = await getAuthHeaders()
    return await sdk.client
      .fetch<StoreProfile>(`/store/sellers/${handle}`, {
        method: "GET",
        headers,
        cache: "no-store",
      })
      .catch(() => null)
  } catch {
    return null
  }
}

// ── following (buyer) ───────────────────────────────────────────────────

export const followStore = async (
  handle: string
): Promise<{ success: boolean; error: string | null; follower_count?: number }> => {
  try {
    const headers = await getAuthHeaders()
    if (!hasAuth(headers))
      return { success: false, error: "Sign in to follow stores." }

    const res = await sdk.client.fetch<{ follower_count: number }>(
      `/store/sellers/${handle}/follow`,
      { method: "POST", headers }
    )
    return { success: true, error: null, follower_count: res.follower_count }
  } catch (error: any) {
    return { success: false, error: error?.message ?? error?.toString?.() ?? String(error) }
  }
}

export const unfollowStore = async (
  handle: string
): Promise<{ success: boolean; error: string | null; follower_count?: number }> => {
  try {
    const headers = await getAuthHeaders()
    if (!hasAuth(headers))
      return { success: false, error: "Sign in to follow stores." }

    const res = await sdk.client.fetch<{ follower_count: number }>(
      `/store/sellers/${handle}/follow`,
      { method: "DELETE", headers }
    )
    return { success: true, error: null, follower_count: res.follower_count }
  } catch (error: any) {
    return { success: false, error: error?.message ?? error?.toString?.() ?? String(error) }
  }
}

// ── notifications (buyer) ───────────────────────────────────────────────

export type AppNotification = {
  id: string
  kind: "store_broadcast" | "giveaway_claimed"
  broadcast_id: string | null
  seller_id: string | null
  actor_label: string | null
  actor_handle: string | null
  title: string
  body: string
  payload: {
    type?: string
    product_id?: string | null
    voucher_code?: string | null
    discount_type?: string | null
    discount_value?: number | null
  } | null
  read_at: string | null
  created_at: string
}

export const getNotifications = async (): Promise<{
  notifications: AppNotification[]
  unread_count: number
} | null> => {
  try {
    const headers = await getAuthHeaders()
    if (!hasAuth(headers)) return null

    return await sdk.client
      .fetch<{ notifications: AppNotification[]; unread_count: number }>(
        "/store/notifications",
        { method: "GET", headers, cache: "no-store" }
      )
      .catch(() => null)
  } catch {
    return null
  }
}

export const markNotificationRead = async (
  id: string
): Promise<{ success: boolean; error: string | null }> => {
  try {
    const headers = await getAuthHeaders()
    if (!hasAuth(headers)) return { success: false, error: "Not signed in." }

    await sdk.client.fetch(`/store/notifications/${id}/read`, {
      method: "POST",
      headers,
    })
    return { success: true, error: null }
  } catch (error: any) {
    return { success: false, error: error?.message ?? error?.toString?.() ?? String(error) }
  }
}

export const claimBroadcast = async (
  broadcastId: string
): Promise<{ success: boolean; error: string | null; already?: boolean }> => {
  try {
    const headers = await getAuthHeaders()
    if (!hasAuth(headers))
      return { success: false, error: "Sign in to claim giveaways." }

    const res = await sdk.client.fetch<{ claimed: boolean; already?: boolean }>(
      `/store/broadcasts/${broadcastId}/claim`,
      { method: "POST", headers }
    )
    return { success: res.claimed, error: null, already: res.already }
  } catch (error: any) {
    return { success: false, error: error?.message ?? error?.toString?.() ?? String(error) }
  }
}

// ── seller broadcasts ───────────────────────────────────────────────────

export type SellerBroadcast = {
  id: string
  type: "general" | "product" | "offer" | "voucher" | "giveaway"
  title: string
  body: string
  created_at?: string
  delivered?: number
  read_count?: number
  giveaway_claims_count?: number
  voucher_code?: string | null
}

export const listSellerBroadcasts = async (): Promise<{
  broadcasts: SellerBroadcast[]
  remaining_this_week: number
} | null> => {
  try {
    const headers = await getSellerAuthHeaders()
    if (!hasAuth(headers)) return null

    return await sdk.client
      .fetch<{ broadcasts: SellerBroadcast[]; remaining_this_week: number }>(
        "/sellers/broadcasts",
        { method: "GET", headers, cache: "no-store" }
      )
      .catch(() => null)
  } catch {
    return null
  }
}

export const createSellerBroadcast = async (body: {
  type: "general" | "product" | "offer" | "voucher" | "giveaway"
  title: string
  body: string
  product_id?: string
  voucher?: {
    discount_type: "fixed" | "percent"
    discount_value: number
    expires_in_days?: number
  }
}): Promise<{ success: boolean; error: string | null }> => {
  try {
    const headers = await getSellerAuthHeaders()
    if (!hasAuth(headers)) return { success: false, error: "Not signed in as a seller." }

    await sdk.client.fetch("/sellers/broadcasts", {
      method: "POST",
      headers,
      body: {
        type: body.type,
        title: body.title,
        body: body.body,
        product_id: body.product_id || undefined,
        voucher: body.voucher,
      },
    })

    const tag = await getSellerCacheTag("seller")
    revalidateTag(tag, "max")
    return { success: true, error: null }
  } catch (error: any) {
    return { success: false, error: error?.message ?? error?.toString?.() ?? String(error) }
  }
}

export const getSellerFollowers = async (): Promise<{
  follower_count: number
  remaining_this_week: number
  broadcasts: SellerBroadcast[]
} | null> => {
  try {
    const headers = await getSellerAuthHeaders()
    if (!hasAuth(headers)) return null

    return await sdk.client
      .fetch<{ follower_count: number; remaining_this_week: number; broadcasts: SellerBroadcast[] }>(
        "/sellers/followers",
        { method: "GET", headers, cache: "no-store" }
      )
      .catch(() => null)
  } catch {
    return null
  }
}

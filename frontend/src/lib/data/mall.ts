"use server"

import { sdk } from "@lib/config"
import { revalidateTagSafely } from "./cache"
import { getSellerAuthHeaders, getSellerCacheTag } from "./seller-cookies"
import { getAuthHeaders } from "./cookies"

export type Mall = {
  id: string
  name: string
  description?: string | null
  created_by_seller_id: string
  status: string
  target_sellers: number
  target_buyers: number
  prize_winner_count: number
  prize_distribution: "equal" | "random"
  prize_pool_ngn: number | string
  contributed_ngn: number | string
  remaining_ngn: number | string
  paid_out_ngn?: number | string
  seller_count?: number
  buyer_count?: number
  winner_count?: number
  shopping_open?: boolean
  sellers?: MallSeller[]
  buyers?: MallBuyer[]
  prizes?: MallPrize[]
  viewer_joined?: boolean
  viewer_prize?: MallPrize | null
  starts_at?: string | null
  ends_at?: string | null
  expires_at: string | null
  created_at: string
}

export type MallBuyer = {
  id: string
  mall_id: string
  buyer_email?: string
  is_me?: boolean
  joined_at: string
  purchase_count: number
  has_won: boolean
  won_prize_ngn?: number | string | null
  won_at?: string | null
}

export type MallSeller = {
  id: string
  mall_id: string
  seller_id: string
  contribution_ngn: number | string
  product_ids?: string[] | null
  contribution_ledger_id?: string | null
  redeemable_id?: string | null
  joined_at: string
}

export type MallPrize = {
  id: string
  mall_id: string
  winner_buyer_email: string
  amount_ngn: number | string
  claimed: boolean
}

export type MallWin = {
  id: string
  mall_id: string
  mall_name: string
  winner_buyer_email: string
  amount_ngn: number | string
  won_at: string
}

export const listActiveMalls = async (): Promise<Mall[]> => {
  try {
    return await sdk.client
      .fetch<{ malls: Mall[] }>("/store/malls/active", {
        method: "GET",
        cache: "no-store",
      })
      .then(({ malls }) => malls ?? [])
      .catch(() => [])
  } catch {
    return []
  }
}

export const listRecentMallWins = async (): Promise<MallWin[]> => {
  try {
    return await sdk.client
      .fetch<{ wins: MallWin[] }>("/store/malls/wins", {
        method: "GET",
        cache: "no-store",
      })
      .then(({ wins }) => wins ?? [])
      .catch(() => [])
  } catch {
    return []
  }
}

export const retrieveMall = async (id: string): Promise<Mall | null> => {
  try {
    const headers = await getAuthHeaders()
    return await sdk.client
      .fetch<{ mall: Mall }>(`/store/malls/${id}`, {
        method: "GET",
        headers,
        cache: "no-store",
      })
      .then(({ mall }) => mall)
      .catch(() => null)
  } catch {
    return null
  }
}

export const listMallGoods = async (id: string): Promise<any[]> => {
  try {
    return await sdk.client
      .fetch<{ goods: any[] }>(`/store/malls/${id}/goods`, {
        method: "GET",
        cache: "no-store",
      })
      .then(({ goods }) => goods ?? [])
      .catch(() => [])
  } catch {
    return []
  }
}

export const joinMallAsBuyer = async (
  mallId: string,
  _buyerEmail?: string
): Promise<{ success: boolean; error: string | null }> => {
  try {
    const headers = await getAuthHeaders()
    if (!("authorization" in headers)) return { success: false, error: "Sign in to join this mall." }
    await sdk.client.fetch(`/store/malls/${mallId}/join-buyer`, {
      method: "POST",
      headers,
      body: {},
    })
    return { success: true, error: null }
  } catch (error: any) {
    return { success: false, error: error?.message ?? error?.toString() }
  }
}

export const recordMallPurchase = async (
  mallId: string,
  _buyerEmail: string,
  orderId: string
): Promise<{
  success: boolean
  won?: boolean
  prizeAmount?: number
  error: string | null
}> => {
  try {
    const headers = await getAuthHeaders()
    if (!("authorization" in headers)) return { success: false, error: "Sign in to complete a mall purchase." }
    const result = await sdk.client.fetch<{ result: any }>(
      `/store/malls/${mallId}/purchase`,
      { method: "POST", headers, body: { orderId } }
    )
    return {
      success: true,
      won: result?.result?.won ?? false,
      prizeAmount: result?.result?.prizeAmount,
      error: null,
    }
  } catch (error: any) {
    return { success: false, error: error?.message ?? error?.toString() }
  }
}

// --- seller-side (bearer auth) ---

type AuthHeaders = { authorization: string } | {}
const hasAuth = (headers: AuthHeaders): headers is { authorization: string } =>
  "authorization" in headers

export const listSellerMalls = async (): Promise<Mall[]> => {
  try {
    const headers = await getSellerAuthHeaders()
    if (!hasAuth(headers)) return []

    return await sdk.client
      .fetch<{ malls: Mall[] }>("/store/malls", {
        method: "GET",
        headers,
        cache: "no-store",
      })
      .then(({ malls }) => malls ?? [])
      .catch(() => [])
  } catch {
    return []
  }
}

export const createMall = async (input: {
  name: string
  description?: string
  prizeWinnerCount: number
  prizePoolNgn: number
  productIds: string[]
}): Promise<{ success: boolean; error: string | null }> => {
  try {
    const headers = await getSellerAuthHeaders()
    if (!hasAuth(headers)) {
      return { success: false, error: "Not signed in as a seller." }
    }

    await sdk.client.fetch("/store/malls", {
      method: "POST",
      headers,
      body: input,
    })

    const tag = await getSellerCacheTag("seller")
    revalidateTagSafely(tag)

    return { success: true, error: null }
  } catch (error: any) {
    return { success: false, error: error?.message ?? error?.toString() }
  }
}

export const joinMallAsSeller = async (
  mallId: string,
  contributionNgn: number,
  productIds: string[]
): Promise<{ success: boolean; error: string | null }> => {
  try {
    const headers = await getSellerAuthHeaders()
    if (!hasAuth(headers)) {
      return { success: false, error: "Not signed in as a seller." }
    }

    await sdk.client.fetch(`/store/malls/${mallId}/join`, {
      method: "POST",
      headers,
      body: { contributionNgn, productIds },
    })

    const tag = await getSellerCacheTag("seller")
    revalidateTagSafely(tag)

    return { success: true, error: null }
  } catch (error: any) {
    return { success: false, error: error?.message ?? error?.toString() }
  }
}

// Author-only mall lifecycle after expiry.
export const relaunchMall = async (
  mallId: string
): Promise<{ success: boolean; error: string | null }> => {
  try {
    const headers = await getSellerAuthHeaders()
    if (!hasAuth(headers)) {
      return { success: false, error: "Not signed in as a seller." }
    }

    await sdk.client.fetch(`/store/malls/${mallId}/relaunch`, {
      method: "POST",
      headers,
    })

    const tag = await getSellerCacheTag("seller")
    revalidateTagSafely(tag)

    return { success: true, error: null }
  } catch (error: any) {
    return { success: false, error: error?.message ?? error?.toString() }
  }
}

export const cancelMall = async (
  mallId: string
): Promise<{ success: boolean; error: string | null }> => {
  try {
    const headers = await getSellerAuthHeaders()
    if (!hasAuth(headers)) {
      return { success: false, error: "Not signed in as a seller." }
    }

    await sdk.client.fetch(`/store/malls/${mallId}/cancel`, {
      method: "POST",
      headers,
    })

    const tag = await getSellerCacheTag("seller")
    revalidateTagSafely(tag)

    return { success: true, error: null }
  } catch (error: any) {
    return { success: false, error: error?.message ?? error?.toString() }
  }
}

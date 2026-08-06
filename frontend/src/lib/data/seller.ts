"use server"

import { sdk } from "@lib/config"
import { redirect } from "next/navigation"
import { revalidateTag } from "next/cache"
import {
  getSellerAuthHeaders,
  getSellerCacheTag,
  removeSellerAuthToken,
  setSellerAuthToken,
} from "./seller-cookies"

type SellerAdmin = {
  id: string
  first_name?: string
  last_name?: string
  email?: string
  phone?: string
  role?: "owner" | "staff"
  seller?: {
    id: string
    name?: string
    handle?: string
    logo?: string
    description?: string
  }
}

type SellerProduct = {
  id: string
  title: string
  handle?: string
  description?: string
  thumbnail?: string | null
  status?: string
  metadata?: { product_video?: string | null }
  images?: { url: string }[]
  options?: { title?: string; values?: { value?: string }[] }[]
  variants?: {
    id: string
    title: string
    options?: { value?: string }[]
    prices?: { id?: string; currency_code: string; amount: number }[]
    inventory_items?: {
      inventory_item_id?: string
      location_levels?: {
        id?: string
        location_id?: string
        stocked_quantity?: number
      }[]
    }[]
  }[]
}

type AuthHeaders = { authorization: string } | {}

const hasAuth = (headers: AuthHeaders): headers is { authorization: string } =>
  "authorization" in headers

export const retrieveSeller = async (): Promise<SellerAdmin | null> => {
  try {
    const headers = await getSellerAuthHeaders()

    if (!hasAuth(headers)) return null

    return await sdk.client
      .fetch<{ seller_admin: SellerAdmin }>("/sellers/me", {
        method: "GET",
        headers,
      })
      .then(({ seller_admin }) => seller_admin)
      .catch(() => null)
  } catch {
    return null
  }
}

export async function sellerRegister(
  _currentState: unknown,
  formData: FormData
) {
  const email = formData.get("email") as string
  const first_name = formData.get("first_name") as string
  const last_name = formData.get("last_name") as string
  const name = formData.get("name") as string
  const handle = (formData.get("handle") as string) || undefined

  try {
    const password = formData.get("password") as string

    // 1. Create the auth credential + issue a register token for the new
    // identity (no actor attached yet).
    const token = await sdk.auth.register("seller", "emailpass", {
      email,
      password,
    })

    await setSellerAuthToken(token as string)
    const headers = await getSellerAuthHeaders()

    // 2. Create the seller + seller_admin; backend links identity -> actor.
    await sdk.client.fetch("/sellers", {
      method: "POST",
      headers,
      body: {
        name,
        handle,
        admin: { email, first_name, last_name },
      },
    })

    // 3. Re-login so the token carries the seller admin actor for /sellers/*.
    const loginToken = await sdk.auth.login("seller", "emailpass", {
      email,
      password,
    })
    await setSellerAuthToken(loginToken as string)

    const tag = await getSellerCacheTag("seller")
    revalidateTag(tag, "max")

    return null
  } catch (error: any) {
    return error.toString()
  }
}

export async function sellerLogin(_currentState: unknown, formData: FormData) {
  const email = formData.get("email") as string
  const password = formData.get("password") as string

  try {
    const token = await sdk.auth.login("seller", "emailpass", {
      email,
      password,
    })
    await setSellerAuthToken(token as string)

    const tag = await getSellerCacheTag("seller")
    revalidateTag(tag, "max")

    return null
  } catch (error: any) {
    return error.toString()
  }
}

export async function sellerSignout(countryCode: string) {
  await sdk.auth.logout()
  await removeSellerAuthToken()
  redirect(`/${countryCode}/seller`)
}

export const listSellerProducts = async (): Promise<SellerProduct[]> => {
  try {
    const headers = await getSellerAuthHeaders()
    if (!hasAuth(headers)) return []

    return await sdk.client
      .fetch<{ products: SellerProduct[] }>("/sellers/products", {
        method: "GET",
        headers,
        cache: "no-store",
      })
      .then(({ products }) => products ?? [])
      .catch(() => [])
  } catch {
    return []
  }
}

export const retrieveSellerBalance = async () => {
  try {
    const headers = await getSellerAuthHeaders()
    if (!hasAuth(headers)) return null

    return await sdk.client
      .fetch<{ balances: any; return_window_days?: number; minimum_ngn?: number }>(
        "/sellers/balance",
        { method: "GET", headers, cache: "no-store" }
      )
      .catch(() => null)
  } catch {
    return null
  }
}

export const listSellerOrders = async (): Promise<any[]> => {
  try {
    const headers = await getSellerAuthHeaders()
    if (!hasAuth(headers)) return []

    return await sdk.client
      .fetch<{ orders: any[] }>("/sellers/orders", {
        method: "GET",
        headers,
        cache: "no-store",
      })
      .then(({ orders }) => orders ?? [])
      .catch(() => [])
  } catch {
    return []
  }
}

export const markOrderDelivered = async (orderId: string): Promise<string | null> => {
  try {
    const headers = await getSellerAuthHeaders()
    if (!hasAuth(headers)) return "Not signed in as a seller."

    await sdk.client.fetch(`/sellers/orders/${orderId}/mark-delivered`, {
      method: "POST",
      headers,
    })

    const tag = await getSellerCacheTag("seller")
    revalidateTag(tag, "max")

    return null
  } catch (error: any) {
    return error.toString()
  }
}

export const confirmReturnReceived = async (
  orderId: string
): Promise<string | null> => {
  try {
    const headers = await getSellerAuthHeaders()
    if (!hasAuth(headers)) return "Not signed in as a seller."

    await sdk.client.fetch(`/sellers/orders/${orderId}/return-received`, {
      method: "POST",
      headers,
    })

    const tag = await getSellerCacheTag("seller")
    revalidateTag(tag, "max")

    return null
  } catch (error: any) {
    return error.toString()
  }
}

export const listPayoutAccounts = async (): Promise<any[]> => {
  try {
    const headers = await getSellerAuthHeaders()
    if (!hasAuth(headers)) return []

    return await sdk.client
      .fetch<{ payout_accounts: any[] }>("/sellers/payout-accounts", {
        method: "GET",
        headers,
        cache: "no-store",
      })
      .then(({ payout_accounts }) => payout_accounts ?? [])
      .catch(() => [])
  } catch {
    return []
  }
}

export const createPayoutAccount = async (
  body: {
    type: "bank_account"
    bank_code: string
    account_name: string
    account_number: string
  } | {
    type: "crypto_address"
    network: "base" | "solana"
    address: string
  }
): Promise<{ success: boolean; error: string | null }> => {
  try {
    const headers = await getSellerAuthHeaders()
    if (!hasAuth(headers)) return { success: false, error: "Not signed in as a seller." }

    await sdk.client.fetch("/sellers/payout-accounts", {
      method: "POST",
      headers,
      body,
    })

    const tag = await getSellerCacheTag("seller")
    revalidateTag(tag, "max")

    return { success: true, error: null }
  } catch (error: any) {
    return { success: false, error: error.toString() }
  }
}

export const listSellerPayouts = async (): Promise<any[]> => {
  try {
    const headers = await getSellerAuthHeaders()
    if (!hasAuth(headers)) return []

    return await sdk.client
      .fetch<{ payouts: any[] }>("/sellers/payouts", {
        method: "GET",
        headers,
        cache: "no-store",
      })
      .then(({ payouts }) => payouts ?? [])
      .catch(() => [])
  } catch {
    return []
  }
}

export const requestSellerPayout = async (
  rail: "paystack" | "crypto-usdc"
): Promise<{ success: boolean; error: string | null }> => {
  try {
    const headers = await getSellerAuthHeaders()
    if (!hasAuth(headers)) return { success: false, error: "Not signed in as a seller." }

    await sdk.client.fetch("/sellers/payouts", {
      method: "POST",
      headers,
      body: { rail },
    })

    const tag = await getSellerCacheTag("seller")
    revalidateTag(tag, "max")

    return { success: true, error: null }
  } catch (error: any) {
    return { success: false, error: error.toString() }
  }
}

export type SellerReferral = {
  id: string
  code: string
  referrer_role?: string
  referee_email?: string | null
  status?: string
  reward_amount?: number | string | null
  currency_code?: string
  capped_reason?: string | null
  qualified_at?: string | null
  created_at?: string
}

export const listSellerReferrals = async (): Promise<{
  referrals: SellerReferral[]
  stats: { count: number; qualified_count: number; lifetime_earned: number }
} | null> => {
  try {
    const headers = await getSellerAuthHeaders()
    if (!hasAuth(headers)) return null

    return await sdk.client
      .fetch<{
        referrals: SellerReferral[]
        stats: { count: number; qualified_count: number; lifetime_earned: number }
      }>("/sellers/referrals", {
        method: "GET",
        headers,
        cache: "no-store",
      })
      .catch(() => null)
  } catch {
    return null
  }
}

export const createSellerReferral = async (
  refereeEmail: string
): Promise<{ success: boolean; error: string | null; code?: string }> => {
  try {
    const headers = await getSellerAuthHeaders()
    if (!hasAuth(headers)) return { success: false, error: "Not signed in as a seller." }

    const res = await sdk.client.fetch<{ referral: SellerReferral }>(
      "/sellers/referrals",
      { method: "POST", headers, body: { referee_email: refereeEmail } }
    )

    const tag = await getSellerCacheTag("seller")
    revalidateTag(tag, "max")

    return { success: true, error: null, code: res.referral?.code }
  } catch (error: any) {
    return { success: false, error: error.toString() }
  }
}

export type SellerRedeemable = {
  id: string
  type: "gift_card" | "voucher" | "ticket"
  code: string
  status?: string
  currency_code?: string
  title?: string
  face_value?: number | string | null
  balance?: number | string | null
  discount_type?: string | null
  discount_value?: number | null
  price?: number | string | null
  expires_at?: string | null
  issued_to_email?: string | null
  created_at?: string
}

export const listSellerRedeemables = async (
  filters: { type?: string; status?: string } = {}
): Promise<SellerRedeemable[]> => {
  try {
    const headers = await getSellerAuthHeaders()
    if (!hasAuth(headers)) return []

    const query: Record<string, string> = {}
    if (filters.type) query.type = filters.type
    if (filters.status) query.status = filters.status

    return await sdk.client
      .fetch<{ redeemables: SellerRedeemable[] }>("/sellers/redeemables", {
        method: "GET",
        headers,
        query,
        cache: "no-store",
      })
      .then(({ redeemables }) => redeemables ?? [])
      .catch(() => [])
  } catch {
    return []
  }
}

export const createSellerRedeemable = async (
  body: {
    type: "gift_card" | "voucher" | "ticket"
    title: string
    face_value?: number
    discount_type?: "fixed" | "percent"
    discount_value?: number
    price?: number
    expires_at?: string
    quantity?: number
    issued_to_email?: string
  }
): Promise<{ success: boolean; error: string | null; code?: string }> => {
  try {
    const headers = await getSellerAuthHeaders()
    if (!hasAuth(headers)) return { success: false, error: "Not signed in as a seller." }

    const res = await sdk.client.fetch<{ redeemables: SellerRedeemable[] }>(
      "/sellers/redeemables",
      {
        method: "POST",
        headers,
        body: {
          type: body.type,
          title: body.title,
          face_value: body.face_value,
          discount_type: body.discount_type,
          discount_value: body.discount_value,
          price: body.price,
          expires_at: body.expires_at || undefined,
          quantity: body.quantity,
          issued_to_email: body.issued_to_email || undefined,
        },
      }
    )

    const tag = await getSellerCacheTag("seller")
    revalidateTag(tag, "max")

    return { success: true, error: null, code: res.redeemables?.[0]?.code }
  } catch (error: any) {
    return { success: false, error: error.toString() }
  }
}

export const cancelSellerRedeemable = async (
  id: string
): Promise<{ success: boolean; error: string | null }> => {
  try {
    const headers = await getSellerAuthHeaders()
    if (!hasAuth(headers)) return { success: false, error: "Not signed in as a seller." }

    await sdk.client.fetch(`/sellers/redeemables/${id}/cancel`, {
      method: "POST",
      headers,
    })

    const tag = await getSellerCacheTag("seller")
    revalidateTag(tag, "max")

    return { success: true, error: null }
  } catch (error: any) {
    return { success: false, error: error.toString() }
  }
}

export const redeemInStore = async (
  code: string,
  amount?: number
): Promise<{ success: boolean; error: string | null }> => {
  try {
    const headers = await getSellerAuthHeaders()
    if (!hasAuth(headers)) return { success: false, error: "Not signed in as a seller." }

    await sdk.client.fetch("/sellers/redeemables/redeem", {
      method: "POST",
      headers,
      body: { code, amount },
    })

    const tag = await getSellerCacheTag("seller")
    revalidateTag(tag, "max")

    return { success: true, error: null }
  } catch (error: any) {
    return { success: false, error: error.toString() }
  }
}

// ── AI seller tools ──────────────────────────────────────────────────────

export type AiQuota = {
  used: number
  limit: number
  remaining: number
}

export const getSellerAiQuota = async (): Promise<AiQuota | null> => {
  try {
    const headers = await getSellerAuthHeaders()
    if (!hasAuth(headers)) return null

    return await sdk.client
      .fetch<{ quota: AiQuota }>("/sellers/ai/quota", {
        method: "GET",
        headers,
        cache: "no-store",
      })
      .then(({ quota }) => quota)
      .catch(() => null)
  } catch {
    return null
  }
}

export const getSellerBrief = async (period: "daily" | "weekly") => {
  try {
    const headers = await getSellerAuthHeaders()
    if (!hasAuth(headers)) return null

    return await sdk.client
      .fetch<{ ok: boolean; brief: any }>("/sellers/ai/brief", {
        method: "GET",
        headers,
        query: { period },
        cache: "no-store",
      })
      .catch(() => null)
  } catch {
    return null
  }
}

type AiResponse<T> = {
  ok: boolean
  result?: T
  quota?: AiQuota
  extra?: any
  message?: string
  code?: string
}

const runAi = async <T>(
  path: string,
  body: Record<string, unknown> | undefined
): Promise<AiResponse<T> & { success: boolean; error: string | null }> => {
  try {
    const headers = await getSellerAuthHeaders()
    if (!hasAuth(headers))
      return { success: false, error: "Not signed in as a seller.", ok: false }

    const res = await sdk.client.fetch<AiResponse<T>>(path, {
      method: "POST",
      headers,
      body,
    })
    return { ...res, success: true, error: null }
  } catch (error: any) {
    return {
      success: false,
      error: error?.message ?? error?.toString?.() ?? String(error),
      ok: false,
    }
  }
}

export const generateSellerBrief = async (period: "daily" | "weekly") =>
  runAi<{ narrative?: string } & Record<string, unknown>>(
    "/sellers/ai/brief",
    { period }
  )

export const generateRecommendations = async (period: "daily" | "weekly") =>
  runAi<{
    opportunities: { action: string; sku: string | null; explanation: string }[]
  }>("/sellers/ai/recommendations", { period })

export const askAiInsights = async (question: string) =>
  runAi<string>("/sellers/ai/insights", { question })

export const runAiMarketing = async (goal?: string, tone?: string) =>
  runAi<{
    brand_voice: string
    promo_ideas: string[]
    bundle_suggestions: string[]
  }>("/sellers/ai/marketing", { goal, tone })

export const runAiPricing = async (body: {
  title: string
  category?: string
  cost?: number
  currency_code?: string
}) =>
  runAi<{
    suggested_price: number
    floor_price: number
    ceiling_price: number
    reasoning: string
  }>("/sellers/ai/pricing", body)

export const runAiListing = async (notes: string, category?: string) =>
  runAi<{
    title: string
    description: string
    tags: string[]
    seo_title: string
    seo_description: string
  }>("/sellers/ai/listing", { notes, category })

export const runAiAccounting = async () =>
  runAi<Record<string, unknown>>("/sellers/ai/accounting", {})

export const retrieveSellerProduct = async (
  id: string
): Promise<SellerProduct | null> => {
  try {
    const headers = await getSellerAuthHeaders()
    if (!hasAuth(headers)) return null

    const products = await listSellerProducts()
    return products.find((p) => p.id === id) ?? null
  } catch {
    return null
  }
}

export const updateSellerProduct = async (
  id: string,
  update: {
    title?: string
    description?: string
    photo?: string
    videoUrl?: string | null
    variants?: {
      id: string
      price?: number
      stock?: number
    }[]
  }
) => {
  try {
    const headers = await getSellerAuthHeaders()
    if (!hasAuth(headers)) return "Not signed in as a seller."

    const body: Record<string, unknown> = {
      title: update.title,
      description: update.description,
      photo: update.photo,
      variants: update.variants,
    }
    if (update.videoUrl !== undefined) body.video_url = update.videoUrl

    await sdk.client.fetch(`/sellers/products/${id}`, {
      method: "PATCH",
      headers,
      body,
    })

    const tag = await getSellerCacheTag("seller")
    revalidateTag(tag, "max")

    return null
  } catch (error: any) {
    return error.toString()
  }
}

export const createSellerProduct = async (
  _currentState: unknown,
  formData: FormData
) => {
  try {
    const headers = await getSellerAuthHeaders()
    if (!hasAuth(headers)) return "Not signed in as a seller."

    const title = formData.get("title") as string
    const description = formData.get("description") as string
    const photo = formData.get("photo") as string
    const videoUrl = formData.get("video_url") as string
    const priceRaw = formData.get("price")
    const price = priceRaw !== "" && priceRaw != null ? Number(priceRaw) : undefined
    const stockRaw = formData.get("stock")
    const stock =
      stockRaw !== "" && stockRaw != null ? Number(stockRaw) : undefined
    const variantsJson = formData.get("variants_json") as string
    const currency_code = "ngn"

    const variants = variantsJson ? JSON.parse(variantsJson) : null

    await sdk.client.fetch("/sellers/products", {
      method: "POST",
      headers,
      body: variants
        ? {
            title,
            description,
            photo: photo || undefined,
            video_url: videoUrl || undefined,
            currency_code,
            status: "published",
            options: variants.options,
            variants: variants.variants,
          }
        : {
            title,
            description,
            photo: photo || undefined,
            video_url: videoUrl || undefined,
            price,
            stock,
            currency_code,
            status: "published",
          },
    })

    const tag = await getSellerCacheTag("seller")
    revalidateTag(tag, "max")

    return { success: true, error: null }
  } catch (error: any) {
    return { success: false, error: error.toString() }
  }
}

// --- Reviews (seller inbox) ----------------------------------------------

export type SellerReview = {
  id: string
  order_id?: string
  buyer_email?: string
  rating: number
  comment?: string | null
  status?: string
  reply_body?: string | null
  replied_at?: string | null
  created_at?: string
  product_ratings?: { product_id?: string; rating?: number }[]
}

export const listSellerReviews = async (params?: {
  rating?: number
  replied?: boolean
}): Promise<SellerReview[]> => {
  try {
    const headers = await getSellerAuthHeaders()
    if (!hasAuth(headers)) return []

    const query: Record<string, string> = {}
    if (params?.rating) query.rating = String(params.rating)
    if (params?.replied != null) query.replied = String(params.replied)

    return await sdk.client
      .fetch<{ reviews: SellerReview[] }>("/sellers/reviews", {
        method: "GET",
        headers,
        query,
        cache: "no-store",
      })
      .then(({ reviews }) => reviews ?? [])
      .catch(() => [])
  } catch {
    return []
  }
}

export const replyToReview = async (
  reviewId: string,
  body: string
): Promise<{ success: boolean; error: string | null }> => {
  try {
    const headers = await getSellerAuthHeaders()
    if (!hasAuth(headers)) return { success: false, error: "Not signed in as a seller." }

    await sdk.client.fetch(`/sellers/reviews/${reviewId}/reply`, {
      method: "POST",
      headers,
      body: { body },
    })
    return { success: true, error: null }
  } catch (error: any) {
    return { success: false, error: error?.message ?? error?.toString() }
  }
}

// --- Commissions ---------------------------------------------------------

export type CommissionLine = {
  id?: string
  order_id?: string
  currency_code?: string
  order_total?: number
  rate?: number
  commission_amount?: number
  net_amount?: number
  status?: string
  available_at?: string | null
  created_at?: string
}

export const retrieveSellerCommissions = async (): Promise<{
  commission_rate?: number
  summary?: Record<string, { gross: number; commission: number; net: number }>
  commission_lines?: CommissionLine[]
} | null> => {
  try {
    const headers = await getSellerAuthHeaders()
    if (!hasAuth(headers)) return null

    return await sdk.client
      .fetch<{
        commission_rate?: number
        summary?: Record<string, { gross: number; commission: number; net: number }>
        commission_lines?: CommissionLine[]
      }>("/sellers/commissions", {
        method: "GET",
        headers,
        cache: "no-store",
      })
      .catch(() => null)
  } catch {
    return null
  }
}

// --- Tips -----------------------------------------------------------------

export type SellerTip = {
  id: string
  direction?: string
  order_id?: string | null
  buyer_email?: string | null
  seller_id?: string | null
  amount?: number | null
  product_id?: string | null
  product_title?: string | null
  redeemable_code?: string | null
  note?: string | null
  created_at?: string
}

export const listSellerTips = async (): Promise<{
  tips: SellerTip[]
  summary: { given?: number; received?: number; net?: number }
} | null> => {
  try {
    const headers = await getSellerAuthHeaders()
    if (!hasAuth(headers)) return null

    return await sdk.client
      .fetch<{ tips: SellerTip[]; summary: any }>("/sellers/tips", {
        method: "GET",
        headers,
        cache: "no-store",
      })
      .then((r) => ({ tips: r.tips ?? [], summary: r.summary ?? {} }))
      .catch(() => null)
  } catch {
    return null
  }
}

export const giveSellerTip = async (body: {
  order_id?: string
  buyer_email?: string
  amount?: number
  note?: string
}): Promise<{ success: boolean; error: string | null }> => {
  try {
    const headers = await getSellerAuthHeaders()
    if (!hasAuth(headers)) return { success: false, error: "Not signed in as a seller." }

    await sdk.client.fetch("/sellers/tips", {
      method: "POST",
      headers,
      body,
    })
    return { success: true, error: null }
  } catch (error: any) {
    return { success: false, error: error?.message ?? error?.toString() }
  }
}

// --- Trust score ----------------------------------------------------------

export type SellerTrustScore = {
  score: number | null
  tier: string
  review_count: number
  avg_rating: number
  breakdown?: { key: string; weight: number; value: number }[]
}

export const retrieveSellerTrustScore = async (): Promise<SellerTrustScore | null> => {
  try {
    const headers = await getSellerAuthHeaders()
    if (!hasAuth(headers)) return null

    return await sdk.client
      .fetch<SellerTrustScore>("/sellers/trust-score", {
        method: "GET",
        headers,
        cache: "no-store",
      })
      .catch(() => null)
  } catch {
    return null
  }
}

// --- Store team (staff/employees) ----------------------------------------

export type SellerTeamMember = {
  id: string
  role: "owner" | "staff"
  first_name: string | null
  last_name: string | null
  email: string | null
  phone: string | null
  created_at?: string | null
}

export const listSellerTeam = async (): Promise<SellerTeamMember[]> => {
  try {
    const headers = await getSellerAuthHeaders()
    if (!hasAuth(headers)) return []

    return await sdk.client
      .fetch<{ team: SellerTeamMember[] }>("/sellers/team", {
        method: "GET",
        headers,
        cache: "no-store",
      })
      .then(({ team }) => team ?? [])
      .catch(() => [])
  } catch {
    return []
  }
}

export const addSellerTeamMember = async (body: {
  email: string
  password: string
  first_name?: string
  last_name?: string
}): Promise<{ success: boolean; error: string | null }> => {
  try {
    const headers = await getSellerAuthHeaders()
    if (!hasAuth(headers))
      return { success: false, error: "Not signed in as a seller." }

    await sdk.client.fetch("/sellers/team", {
      method: "POST",
      headers,
      body,
    })

    const tag = await getSellerCacheTag("seller")
    revalidateTag(tag, "max")

    return { success: true, error: null }
  } catch (error: any) {
    return { success: false, error: error?.message ?? error?.toString?.() ?? String(error) }
  }
}

export const removeSellerTeamMember = async (
  id: string
): Promise<{ success: boolean; error: string | null }> => {
  try {
    const headers = await getSellerAuthHeaders()
    if (!hasAuth(headers))
      return { success: false, error: "Not signed in as a seller." }

    await sdk.client.fetch(`/sellers/team/${id}`, {
      method: "DELETE",
      headers,
    })

    const tag = await getSellerCacheTag("seller")
    revalidateTag(tag, "max")

    return { success: true, error: null }
  } catch (error: any) {
    return { success: false, error: error?.message ?? error?.toString?.() ?? String(error) }
  }
}

// --- Store settings -------------------------------------------------------

export const updateSellerStore = async (body: {
  name?: string
  handle?: string
  logo?: string | null
  description?: string | null
  first_name?: string
  last_name?: string
}): Promise<{ success: boolean; error: string | null }> => {
  try {
    const headers = await getSellerAuthHeaders()
    if (!hasAuth(headers))
      return { success: false, error: "Not signed in as a seller." }

    await sdk.client.fetch("/sellers/me", {
      method: "PATCH",
      headers,
      body,
    })

    const tag = await getSellerCacheTag("seller")
    revalidateTag(tag, "max")

    return { success: true, error: null }
  } catch (error: any) {
    return { success: false, error: error?.message ?? error?.toString?.() ?? String(error) }
  }
}
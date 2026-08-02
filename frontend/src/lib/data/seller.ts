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
    revalidateTag(tag)

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
    revalidateTag(tag)

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
    revalidateTag(tag)

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
    revalidateTag(tag)

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
    revalidateTag(tag)

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
    revalidateTag(tag)

    return { success: true, error: null }
  } catch (error: any) {
    return { success: false, error: error.toString() }
  }
}

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

    await sdk.client.fetch(`/sellers/products/${id}`, {
      method: "PATCH",
      headers,
      body: update,
    })

    const tag = await getSellerCacheTag("seller")
    revalidateTag(tag)

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
            currency_code,
            status: "published",
            options: variants.options,
            variants: variants.variants,
          }
        : {
            title,
            description,
            photo: photo || undefined,
            price,
            stock,
            currency_code,
            status: "published",
          },
    })

    const tag = await getSellerCacheTag("seller")
    revalidateTag(tag)

    return { success: true, error: null }
  } catch (error: any) {
    return { success: false, error: error.toString() }
  }
}
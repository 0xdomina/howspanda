"use server"

import { MEDUSA_BACKEND_URL, sdk } from "@lib/config"
import medusaError from "@lib/util/medusa-error"
import { HttpTypes } from "@medusajs/types"
import { revalidateTagSafely } from "./cache"
import { headers as nextHeaders } from "next/headers"
import { redirect } from "next/navigation"
import { auth } from "@lib/auth"
import {
  getAuthHeaders,
  getCacheOptions,
  getCacheTag,
  getCartId,
  hasAuthToken,
  removeAuthToken,
  removeCartId,
  setAuthToken,
} from "./cookies"
import { removeSellerAuthToken, setSellerAuthToken } from "./seller-cookies"

type EmailPasswordActor = "customer" | "seller"

async function getStorefrontOrigin(): Promise<string> {
  const requestHeaders = await nextHeaders()
  const host = requestHeaders.get("x-forwarded-host") || requestHeaders.get("host")
  const protocol = requestHeaders.get("x-forwarded-proto") || "https"
  if (!host) throw new Error("The storefront host is unavailable")
  return `${protocol}://${host}`
}

async function saveAddressThroughEdge(
  address: object,
  addressId?: string
) {
  const origin = await getStorefrontOrigin()
  const response = await fetch(`${origin}/api/customer/addresses`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin,
    },
    body: JSON.stringify({ address, addressId }),
    cache: "no-store",
  })

  if (!response.ok) {
    const body = await response.text().catch(() => "")
    throw new Error(body || "Unable to save the address")
  }

  return response.json().catch(() => ({}))
}

/**
 * Authenticate against the explicit Medusa email/password endpoint. The SDK
 * auth helper can negotiate session mode differently between runtimes; the
 * platform stores this bearer token in its own httpOnly cookie.
 */
export const loginWithEmailPassword = async (
  actor: EmailPasswordActor,
  email: string,
  password: string
) => {
  const response = await fetch(
    `${MEDUSA_BACKEND_URL}/auth/${actor}/emailpass`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY
          ? {
              "x-publishable-api-key":
                process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY,
            }
          : {}),
      },
      body: JSON.stringify({ email, password }),
      cache: "no-store",
    }
  )

  const result = (await response.json().catch(() => null)) as {
    token?: string
    message?: string
  } | null

  if (!response.ok) {
    throw new Error(result?.message || `Authentication failed (${response.status})`)
  }

  const { token } = result || {}

  if (!token) throw new Error("Authentication did not return a session token")

  return token
}

export const getNeonSession = async () => {
  try {
    const h = await nextHeaders()
    const session = await auth.api.getSession({ headers: h as any })
    return session
  } catch {
    return null
  }
}

export const retrieveCustomer =
  async (): Promise<HttpTypes.StoreCustomer | null> => {
    // Neon Auth first — works while PandaStack sleeps
    const neonSession = await getNeonSession()
    if (neonSession?.user) {
      // Map Neon user to Medusa customer shape so UI can render account/cart
      const u = neonSession.user as any
      return {
        id: `neon_${u.id}`,
        email: u.email,
        first_name: u.name?.split(" ")[0] || null,
        last_name: u.name?.split(" ").slice(1).join(" ") || null,
        has_account: true,
      } as unknown as HttpTypes.StoreCustomer
    }

    if (!(await hasAuthToken())) return null

    const authHeaders = await getAuthHeaders()

    if (!authHeaders) return null

    const headers = {
      ...authHeaders,
    }

    const next = {
      ...(await getCacheOptions("customers")),
    }

    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        return await sdk.client
          .fetch<{ customer: HttpTypes.StoreCustomer }>(`/store/customers/me`, {
            method: "GET",
            query: {
              fields: "*orders",
            },
            headers,
            next,
            cache: "no-store",
          })
          .then(({ customer }) => customer)
      } catch (error: any) {
        const raw = String(error?.message ?? error ?? "")
        const retryable =
          error?.name === "AbortError" ||
          [502, 503, 504].includes(Number(error?.status)) ||
          /abort|timed out|timeout|warming|booting/i.test(raw)

        if (!retryable || attempt === 1) {
          return null
        }

        await new Promise((resolve) => setTimeout(resolve, 750))
      }
    }

    return null
  }

export const updateCustomer = async (body: HttpTypes.StoreUpdateCustomer) => {
  const headers = {
    ...(await getAuthHeaders()),
  }

  const updateRes = await sdk.store.customer
    .update(body, {}, headers)
    .then(({ customer }) => customer)
    .catch(medusaError)

  const cacheTag = await getCacheTag("customers")
  revalidateTagSafely(cacheTag)

  return updateRes
}

export async function signup(_currentState: unknown, formData: FormData) {
  const email = (formData.get("email") as string)?.trim().toLowerCase()
  const password = formData.get("password") as string
  const code = (formData.get("code") as string)?.trim()

  if (!email || !password) {
    return "Email and password are required."
  }

  const firstName = (formData.get("first_name") as string) || ""
  const lastName = (formData.get("last_name") as string) || ""
  const name = `${firstName} ${lastName}`.trim() || email

  // Neon Auth first — works offline while PandaStack sleeps
  try {
    const h = await nextHeaders()
    const neonRes = await auth.api.signUpEmail({
      body: { email, password, name } as any,
      headers: h as any,
    })
    // Neon session cookie is set via Better Auth handler; cart transfer best-effort
    try { await transferCart() } catch {}
    // Try to mirror to Medusa in background (non-blocking, best-effort)
    if (code) {
      const customerForm: Record<string, string> = { email, password, code }
      for (const key of ["first_name", "last_name", "phone"] as const) {
        const v = formData.get(key) as string | null
        if (v) customerForm[key] = v
      }
      sdk.client.fetch("/auth/otp/signup", { method: "POST", body: customerForm }).catch(() => {})
    }
    const customerCacheTag = await getCacheTag("customers")
    revalidateTagSafely(customerCacheTag)
    return (neonRes as any)?.user || { email, has_account: true } as any
  } catch (e: any) {
    // If Neon says already exists, fall through to Medusa flow
    const msg = String(e?.message || "")
    if (!/already|exist|duplicate/i.test(msg)) {
      // Try Medusa OTP flow as fallback when Neon fails for other reason
    }
  }

  // Legacy Medusa OTP flow (requires code)
  if (!code) return "Please add the 6-digit email code or just sign up — your Neon account was being created."
  let stage = "email verification"
  try {
    const customerForm: Record<string, string> = { email, password, code }
    for (const key of ["first_name", "last_name", "phone"] as const) {
      const value = formData.get(key) as string | null
      if (value) customerForm[key] = value
    }
    stage = "account registration"
    const { customer: createdCustomer } = await sdk.client.fetch<{
      customer: HttpTypes.StoreCustomer
    }>("/auth/otp/signup", { method: "POST", body: customerForm })
    stage = "sign in"
    const loginToken = await loginWithEmailPassword("customer", email, password)
    await setAuthToken(loginToken as string)
    const customerCacheTag = await getCacheTag("customers")
    revalidateTagSafely(customerCacheTag)
    try { await transferCart() } catch {}
    return createdCustomer
  } catch (error: any) {
    const status = error?.status ?? error?.response?.status
    const message = String(error?.message ?? error ?? "")
    if (stage === "account registration" && (status === 409 || /already|exist|duplicate|forbidden/i.test(message))) {
      return "An account with this email already exists. Sign in instead."
    }
    if (stage === "sign in") return "Your account was created, but we could not start your session. Please sign in to continue."
    return error?.toString?.() ?? "We could not create your account. Please try again."
  }
}

export async function login(_currentState: unknown, formData: FormData) {
  const email = formData.get("email") as string
  const password = formData.get("password") as string
  const countryCode = (formData.get("countryCode") as string) || "ng"

  // Try Neon first — instant even if PandaStack is 521
  try {
    const h = await nextHeaders()
    const res = await auth.api.signInEmail({ body: { email, password } as any, headers: h as any })
    if ((res as any)?.user) {
      const customerCacheTag = await getCacheTag("customers")
      revalidateTagSafely(customerCacheTag)
      try { await transferCart() } catch {}
      // Fire-and-forget Medusa token for commerce ops when backend wakes
      loginWithEmailPassword("customer", email, password).then(t=>setAuthToken(t as string)).catch(()=>{})
      return
    }
  } catch {
    // fall through to Medusa
  }

  try {
    const customerToken = await loginWithEmailPassword("customer", email, password)
    await setAuthToken(customerToken as string)
    try {
      await sdk.client.fetch("/store/customers/me", {
        method: "GET",
        headers: { authorization: `Bearer ${customerToken as string}` },
        cache: "no-store",
      })
    } catch {}
    const customerCacheTag = await getCacheTag("customers")
    revalidateTagSafely(customerCacheTag)
  } catch (customerError: any) {
    let sellerToken: unknown
    try {
      sellerToken = await loginWithEmailPassword("seller", email, password)
    } catch {
      return customerError.toString()
    }
    await setSellerAuthToken(sellerToken as string)
    redirect(`/${countryCode}/seller`)
  }
  try { await transferCart() } catch {}
}

export async function signout(countryCode: string) {
  try {
    const h = await nextHeaders()
    await auth.api.signOut({ headers: h as any })
  } catch {}
  await removeAuthToken()
  await removeSellerAuthToken()
  const customerCacheTag = await getCacheTag("customers")
  revalidateTagSafely(customerCacheTag)
  await removeCartId()
  const cartCacheTag = await getCacheTag("carts")
  revalidateTagSafely(cartCacheTag)
  redirect(`/${countryCode}/account`)
}

export async function transferCart() {
  const cartId = await getCartId()

  if (!cartId) {
    return
  }

  const headers = await getAuthHeaders()

  await sdk.store.cart.transferCart(cartId, {}, headers)

  const cartCacheTag = await getCacheTag("carts")
  revalidateTagSafely(cartCacheTag)
}

export const addCustomerAddress = async (
  currentState: Record<string, unknown>,
  formData: FormData
): Promise<any> => {
  const isDefaultBilling = (currentState.isDefaultBilling as boolean) || false
  const isDefaultShipping = (currentState.isDefaultShipping as boolean) || false

  const address = {
    first_name: formData.get("first_name") as string,
    last_name: formData.get("last_name") as string,
    company: formData.get("company") as string,
    address_1: formData.get("address_1") as string,
    address_2: formData.get("address_2") as string,
    city: formData.get("city") as string,
    postal_code: formData.get("postal_code") as string,
    province: formData.get("province") as string,
    country_code: formData.get("country_code") as string,
    phone: formData.get("phone") as string,
    is_default_billing: isDefaultBilling,
    is_default_shipping: isDefaultShipping,
  }

  return saveAddressThroughEdge(address)
    .then(async ({ customer }) => {
      const customerCacheTag = await getCacheTag("customers")
      revalidateTagSafely(customerCacheTag)
      return { success: true, error: null }
    })
    .catch((err) => {
      return { success: false, error: err.toString() }
    })
}

export const deleteCustomerAddress = async (
  addressId: string
): Promise<void> => {
  const headers = {
    ...(await getAuthHeaders()),
  }

  await sdk.store.customer
    .deleteAddress(addressId, headers)
    .then(async () => {
      const customerCacheTag = await getCacheTag("customers")
      revalidateTagSafely(customerCacheTag)
      return { success: true, error: null }
    })
    .catch((err) => {
      return { success: false, error: err.toString() }
    })
}

export const updateCustomerAddress = async (
  currentState: Record<string, unknown>,
  formData: FormData
): Promise<any> => {
  const addressId =
    (currentState.addressId as string) || (formData.get("addressId") as string)

  if (!addressId) {
    return { success: false, error: "Address ID is required" }
  }

  const address = {
    first_name: formData.get("first_name") as string,
    last_name: formData.get("last_name") as string,
    company: formData.get("company") as string,
    address_1: formData.get("address_1") as string,
    address_2: formData.get("address_2") as string,
    city: formData.get("city") as string,
    postal_code: formData.get("postal_code") as string,
    province: formData.get("province") as string,
    country_code: formData.get("country_code") as string,
  } as HttpTypes.StoreUpdateCustomerAddress

  const phone = formData.get("phone") as string

  if (phone) {
    address.phone = phone
  }

  return saveAddressThroughEdge(address, addressId)
    .then(async () => {
      const customerCacheTag = await getCacheTag("customers")
      revalidateTagSafely(customerCacheTag)
      return { success: true, error: null }
    })
    .catch((err) => {
      return { success: false, error: err.toString() }
    })
}

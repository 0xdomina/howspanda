"use server"

import { MEDUSA_BACKEND_URL, sdk } from "@lib/config"
import medusaError from "@lib/util/medusa-error"
import { HttpTypes } from "@medusajs/types"
import { revalidateTagSafely } from "./cache"
import { cookies as nextCookies, headers as nextHeaders } from "next/headers"
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
// Single-identity helpers live in the leaf module session-unify.ts (shared
// with seller lanes without import cycles). Imported here for internal use;
// external callers import from "@lib/data/session-unify" directly (a
// "use server" file cannot re-export them).
import {
  bridgeNeonSession,
  ensureMedusaSession,
  getUnifiedAuthHeaders,
} from "./session-unify"

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
  addressId?: string,
  // Freshly-bridged token, when the caller just unified identity: the edge
  // route reads request cookies, which don't include a JWT set during this
  // same request — forwarding it explicitly closes that gap.
  bearerToken?: string
) {
  const origin = await getStorefrontOrigin()
  const response = await fetch(`${origin}/api/customer/addresses`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin,
      ...(bearerToken ? { authorization: `Bearer ${bearerToken}` } : {}),
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

const mapNeonCustomer = (
  neonSession: { user?: any } | null
): HttpTypes.StoreCustomer | null => {
  if (!neonSession?.user) return null
  // Map Neon user to Medusa customer shape so UI can render account/cart.
  // addresses is always an array: account + checkout components map over it
  // and a missing field would crash those pages for bridged sessions.
  const u = neonSession.user as any
  return {
    id: `neon_${u.id}`,
    email: u.email,
    first_name: u.name?.split(" ")[0] || null,
    last_name: u.name?.split(" ").slice(1).join(" ") || null,
    has_account: true,
    addresses: [],
  } as unknown as HttpTypes.StoreCustomer
}

export const retrieveCustomer =
  async (): Promise<HttpTypes.StoreCustomer | null> => {
    // Medusa JWT wins when present: it is the full commerce identity, and
    // preferring it is what lets a bridged session graduate off the Neon
    // fallback. Cookie presence is checked without any I/O first.
    if (await hasAuthToken()) {
      const authHeaders = await getAuthHeaders()
      if (authHeaders) {
        const headers = { ...authHeaders }
        const next = { ...(await getCacheOptions("customers")) }
        for (let attempt = 0; attempt < 2; attempt += 1) {
          try {
            return await sdk.client
              .fetch<{ customer: HttpTypes.StoreCustomer }>(
                `/store/customers/me`,
                {
                  method: "GET",
                  query: { fields: "*orders" },
                  headers,
                  next,
                  cache: "no-store",
                }
              )
              .then(({ customer }) => ({
                ...customer,
                // Never hand UI a customer without an addresses array —
                // AddressBook/AddAddress (profile) and ShippingAddress
                // (checkout) map/filter over it unconditionally.
                addresses: (customer as any)?.addresses ?? [],
              }))
          } catch (error: any) {
            const raw = String(error?.message ?? error ?? "")
            const retryable =
              error?.name === "AbortError" ||
              [502, 503, 504].includes(Number(error?.status)) ||
              /abort|timed out|timeout|warming|booting/i.test(raw)
            if (!retryable) break
            if (attempt === 1) break
            await new Promise((resolve) => setTimeout(resolve, 750))
          }
        }
      }
      // Medusa session missing/expired/unreachable — fall through to Neon.
    }

    // No usable Medusa JWT, but the user may hold a Neon session: unify on
    // demand instead of settling for the limited Neon-only view. One attempt
    // (cooldown-guarded inside) — then the full customer below, else fallback.
    const bridgedToken = await ensureMedusaSession()
    if (bridgedToken) {
      try {
        const fetched = await sdk.client.fetch<{
          customer: HttpTypes.StoreCustomer
        }>(`/store/customers/me`, {
          method: "GET",
          query: { fields: "*orders" },
          headers: { authorization: `Bearer ${bridgedToken}` },
          cache: "no-store",
        })
        const customer = fetched.customer
        return {
          ...customer,
          addresses: (customer as any)?.addresses ?? [],
        }
      } catch {
        // Bridged but the read still failed — fall through to Neon view.
      }
    }

    // Neon Auth fallback — works while the backend sleeps.
    return mapNeonCustomer(await getNeonSession())
  }

export const updateCustomer = async (body: HttpTypes.StoreUpdateCustomer) => {
  const headers = {
    ...(await getUnifiedAuthHeaders()),
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

  // NOTE: Neon (Better Auth) signup happens client-side via authClient so the
  // session cookie is set correctly. This action handles the Medusa mirror
  // (OTP code step) when the backend is reachable.
  if (!code) return "Enter the 6-digit code we sent to your email."
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
    if (stage === "account registration" && (status === 409 || /already|exist|duplicate|forbidden|conflict/i.test(message))) {
      // Most likely cause: a double-tap / retry after the first attempt
      // already created the account (Medusa renders all conflicts as 409).
      // Recover by signing straight in instead of showing a dead-end error.
      try {
        const loginToken = await loginWithEmailPassword("customer", email, password)
        await setAuthToken(loginToken as string)
        const customerCacheTag = await getCacheTag("customers")
        revalidateTagSafely(customerCacheTag)
        try {
          await transferCart()
        } catch {
          // Cart transfer is optional and must not invalidate the session.
        }
        return { email, has_account: true } as any
      } catch {
        return "An account with this email already exists. Sign in instead."
      }
    }
    if (stage === "sign in") return "Your account was created, but we could not start your session. Please sign in to continue."
    return error?.toString?.() ?? "We could not create your account. Please try again."
  }
}

export async function login(_currentState: unknown, formData: FormData) {
  const email = formData.get("email") as string
  const password = formData.get("password") as string
  const countryCode = (formData.get("countryCode") as string) || "ng"

  // NOTE: Neon sign-in happens client-side via authClient (correct cookies).
  // This action is the Medusa lane; the login form tries Neon first and only
  // falls back here when the Neon account does not exist.
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

// Single-identity helpers live in the leaf module session-unify.ts (shared
// with seller lanes without import cycles); external callers import from
// "@lib/data/session-unify" directly (a "use server" file cannot re-export).

// Called after a client-side Neon sign-up/sign-in (authClient sets the real
// session cookie). Unifies the identity (Medusa JWT), transfers any guest
// cart, and refreshes cached identity.
export async function syncNeonAccount() {
  try {
    await bridgeNeonSession()
  } catch {
    // Backend asleep: Neon session alone still signs the user in.
  }
  try {
    await transferCart()
  } catch {
    // A stale or unavailable guest cart must not fail sign-up/sign-in.
  }
  const customerCacheTag = await getCacheTag("customers")
  revalidateTagSafely(customerCacheTag)
  return { ok: true }
}

export async function signout(countryCode: string) {
  // Clear the Neon (Better Auth) session cookie directly. Its default name is
  // `better-auth.session_token`; expiring it here logs the browser out even
  // though the session row stays in Neon until it expires naturally.
  try {
    const { cookies: nextCookies } = await import("next/headers")
    const store = await nextCookies()
    for (const name of [
      "better-auth.session_token",
      "better-auth.session_data",
      "better-auth.dont_remember",
    ]) {
      try {
        store.set(name, "", { maxAge: -1, path: "/" })
      } catch {}
    }
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

  // Unified: a Neon-only session bridges here so the cart actually changes
  // hands instead of silently staying a guest cart.
  const headers = await getUnifiedAuthHeaders()

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

  return saveAddressThroughEdge(address, undefined, (await ensureMedusaSession()) ?? undefined)
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
    ...(await getUnifiedAuthHeaders()),
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

  return saveAddressThroughEdge(address, addressId, (await ensureMedusaSession()) ?? undefined)
    .then(async () => {
      const customerCacheTag = await getCacheTag("customers")
      revalidateTagSafely(customerCacheTag)
      return { success: true, error: null }
    })
    .catch((err) => {
      return { success: false, error: err.toString() }
    })
}

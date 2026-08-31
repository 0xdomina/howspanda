"use server"

import { MEDUSA_BACKEND_URL, sdk } from "@lib/config"
import medusaError from "@lib/util/medusa-error"
import { HttpTypes } from "@medusajs/types"
import { revalidateTagSafely } from "./cache"
import { headers as nextHeaders } from "next/headers"
import { redirect } from "next/navigation"
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

export const retrieveCustomer =
  async (): Promise<HttpTypes.StoreCustomer | null> => {
    if (!(await hasAuthToken())) return null

    const authHeaders = await getAuthHeaders()

    if (!authHeaders) return null

    const headers = {
      ...authHeaders,
    }

    const next = {
      ...(await getCacheOptions("customers")),
    }

    return await sdk.client
      .fetch<{ customer: HttpTypes.StoreCustomer }>(`/store/customers/me`, {
        method: "GET",
        query: {
          fields: "*orders",
        },
        headers,
        next,
        cache: "force-cache",
      })
      .then(({ customer }) => customer)
      .catch(() => null)
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

  if (!email || !password || !code) {
    return "Email, password, and the 6-digit verification code are required."
  }

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
    }>("/auth/otp/signup", {
      method: "POST",
      body: customerForm,
    })

    stage = "sign in"
    const loginToken = await loginWithEmailPassword("customer", email, password)

    await setAuthToken(loginToken as string)

    const customerCacheTag = await getCacheTag("customers")
    revalidateTagSafely(customerCacheTag)

    try {
      await transferCart()
    } catch {
      // Cart transfer is optional and must not invalidate a newly created
      // account session.
    }

    return createdCustomer
  } catch (error: any) {
    const status = error?.status ?? error?.response?.status
    const message = String(error?.message ?? error ?? "")
    if (stage === "account registration" && (status === 409 || /already|exist|duplicate|forbidden/i.test(message))) {
      return "An account with this email already exists. Sign in instead."
    }
    if (stage === "sign in") {
      return "Your account was created, but we could not start your session. Please sign in to continue."
    }
    return error?.toString?.() ?? "We could not create your account. Please try again."
  }
}

export async function login(_currentState: unknown, formData: FormData) {
  const email = formData.get("email") as string
  const password = formData.get("password") as string
  const countryCode = (formData.get("countryCode") as string) || "ng"

  try {
    const customerToken = await loginWithEmailPassword(
      "customer",
      email,
      password
    )
    await setAuthToken(customerToken as string)
    // Some legacy seller identities can authenticate through the customer
    // provider but do not have a customer record. Treat those as seller
    // sessions so the single sign-in form still reaches Manage Business.
    // A valid auth token is sufficient to establish the session. Profile
    // hydration runs separately and must not turn a successful sign-in into
    // a false "Forbidden" result when a store-key header is unavailable.
    try {
      await sdk.client.fetch("/store/customers/me", {
        method: "GET",
        headers: { authorization: `Bearer ${customerToken as string}` },
        cache: "no-store",
      })
    } catch {
      // Keep the session; the account page will retry profile hydration.
    }
    const customerCacheTag = await getCacheTag("customers")
    revalidateTagSafely(customerCacheTag)
  } catch (customerError: any) {
    // Existing stores created before unified accounts used the seller actor.
    // Keep those accounts reachable through the one public sign-in form while
    // all new upgrades continue using the customer session.
    let sellerToken: unknown
    try {
      sellerToken = await loginWithEmailPassword("seller", email, password)
    } catch {
      return customerError.toString()
    }
    await setSellerAuthToken(sellerToken as string)
    redirect(`/${countryCode}/seller`)
  }

  try {
    await transferCart()
  } catch {
    // A stale or unavailable guest cart must not make sign-in look failed.
  }
}

export async function signout(countryCode: string) {
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

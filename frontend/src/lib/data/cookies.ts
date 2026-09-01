import "server-only"
import { cookies as nextCookies } from "next/headers"

export const getAuthHeaders = async (): Promise<
  { authorization: string } | {}
> => {
  try {
    const cookies = await nextCookies()
    const token = cookies.get("_medusa_jwt")?.value

    if (!token) {
      return {}
    }

    return { authorization: `Bearer ${token}` }
  } catch {
    return {}
  }
}

export const hasAuthToken = async (): Promise<boolean> => {
  try {
    const cookies = await nextCookies()
    return Boolean(cookies.get("_medusa_jwt")?.value)
  } catch {
    return false
  }
}

const CHECKOUT_CART_COOKIE = "_howsu_checkout_cart"

export const getCacheTag = async (tag: string): Promise<string> => {
  try {
    const cookies = await nextCookies()
    const cacheId = cookies.get("_medusa_cache_id")?.value

    if (!cacheId) {
      return ""
    }

    return `${tag}-${cacheId}`
  } catch (error) {
    return ""
  }
}

export const getCacheOptions = async (
  tag: string
): Promise<{ tags: string[] } | {}> => {
  if (typeof window !== "undefined") {
    return {}
  }

  const cacheTag = await getCacheTag(tag)

  if (!cacheTag) {
    return {}
  }

  return { tags: [`${cacheTag}`] }
}

export const setAuthToken = async (token: string) => {
  const cookies = await nextCookies()
  cookies.set("_medusa_jwt", token, {
    maxAge: 60 * 60 * 24 * 7,
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
  })
}

export const removeAuthToken = async () => {
  const cookies = await nextCookies()
  cookies.set("_medusa_jwt", "", {
    maxAge: -1,
  })
}

export const getCartId = async () => {
  const cookies = await nextCookies()
  // During the cart → checkout redirect, the short-lived handoff cookie is a
  // safe fallback if the root cart cookie has not propagated yet.
  return (
    cookies.get("_medusa_cart_id")?.value ||
    cookies.get(CHECKOUT_CART_COOKIE)?.value
  )
}

export const getCheckoutCartId = async () => {
  const cookies = await nextCookies()
  return cookies.get(CHECKOUT_CART_COOKIE)?.value
}

export const setCheckoutCartId = async (cartId: string) => {
  const cookies = await nextCookies()
  cookies.set(CHECKOUT_CART_COOKIE, cartId, {
    maxAge: 60 * 5,
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    path: "/",
  })
}

export const setCartId = async (cartId: string, countryCode?: string) => {
  const cookies = await nextCookies()
  if (countryCode) {
    cookies.set("_medusa_cart_id", "", {
      maxAge: -1,
      path: `/${countryCode}`,
    })
  }
  cookies.set("_medusa_cart_id", cartId, {
    maxAge: 60 * 60 * 24 * 7,
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    path: "/",
  })
}

export const removeCartId = async () => {
  const cookies = await nextCookies()
  cookies.set("_medusa_cart_id", "", {
    maxAge: -1,
    path: "/",
  })
  cookies.set(CHECKOUT_CART_COOKIE, "", {
    maxAge: -1,
    path: "/",
  })
}

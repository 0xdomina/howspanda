import "server-only"
import { cookies as nextCookies } from "next/headers"

const SELLER_COOKIE = "_medusa_seller_jwt"

export const getSellerAuthHeaders = async (): Promise<
  { authorization: string } | {}
> => {
  try {
    const cookies = await nextCookies()
    const token = cookies.get(SELLER_COOKIE)?.value

    if (!token) {
      return {}
    }

    return { authorization: `Bearer ${token}` }
  } catch {
    return {}
  }
}

export const getSellerCacheTag = async (tag: string): Promise<string> => {
  try {
    const cookies = await nextCookies()
    const cacheId = cookies.get("_medusa_cache_id")?.value

    if (!cacheId) {
      return ""
    }

    return `${tag}-${cacheId}`
  } catch {
    return ""
  }
}

export const setSellerAuthToken = async (token: string) => {
  const cookies = await nextCookies()
  cookies.set(SELLER_COOKIE, token, {
    maxAge: 60 * 60 * 24 * 7,
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
  })
}

export const removeSellerAuthToken = async () => {
  const cookies = await nextCookies()
  cookies.set(SELLER_COOKIE, "", {
    maxAge: -1,
  })
}
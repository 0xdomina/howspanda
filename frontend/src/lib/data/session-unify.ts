"use server"

import { sdk } from "@lib/config"
import { cookies as nextCookies } from "next/headers"
import { setAuthToken } from "./cookies"

// Single-identity home for Neon <-> Medusa unification. Kept as a leaf
// module (no imports from customer.ts / seller.ts / seller-cookies.ts) so
// both buyer and seller lanes can depend on it without import cycles.
//
// Rule: Neon and Medusa are companions, not competitors. Whichever credential
// the user holds, these helpers end with a usable Medusa JWT — or fail soft
// (null / {ok:false}) so UI renders retry states, never crashes.

// Bridges a Neon session into a first-party Medusa JWT (backend verifies the
// session token server-side, finds-or-creates the customer, mints the token).
// Silent best-effort: a sleeping backend just means "try again on next load".
// Bounded by timeoutMs so on-demand callers inside user-facing actions can
// never hang the request while the backend cold-starts.
export async function bridgeNeonSession(
  timeoutMs = 12_000
): Promise<{ ok: boolean; token?: string }> {
  try {
    const cookies = await nextCookies()
    const sessionToken =
      cookies.get("__Secure-better-auth.session_token")?.value ||
      cookies.get("better-auth.session_token")?.value
    if (!sessionToken) return { ok: false }
    let timer: ReturnType<typeof setTimeout> | undefined
    const timeout = new Promise<null>((_, reject) => {
      timer = setTimeout(() => reject(new Error("bridge-timeout")), timeoutMs)
    })
    try {
      const res = await Promise.race([
        sdk.client.fetch<{ token?: string }>(`/store/auth/neon`, {
          method: "POST",
          body: { sessionToken },
          cache: "no-store",
        }),
        timeout,
      ])
      if (!res?.token) return { ok: false }
      await setAuthToken(res.token)
      return { ok: true, token: res.token }
    } finally {
      if (timer) clearTimeout(timer)
    }
  } catch {
    return { ok: false }
  }
}

// Negative-result memo so a sleeping backend is not hammered on every action:
// one failed bridge attempt suppresses retries for a minute. Success needs no
// memo — the freshly-set _medusa_jwt cookie makes later calls return early.
let lastBridgeFailedAt = 0
const BRIDGE_RETRY_COOLDOWN_MS = 60_000

// Single-identity guarantee: whichever credential the user has, this returns
// a usable Medusa JWT — minting one from the Neon session on demand when
// needed. Returns null only when the user has no session at all or the
// backend is unreachable.
export async function ensureMedusaSession(): Promise<string | null> {
  const cookies = await nextCookies()
  const existing = cookies.get("_medusa_jwt")?.value
  if (existing) return existing
  const hasNeon =
    cookies.get("__Secure-better-auth.session_token")?.value ||
    cookies.get("better-auth.session_token")?.value
  if (!hasNeon) return null
  if (Date.now() - lastBridgeFailedAt < BRIDGE_RETRY_COOLDOWN_MS) return null
  const bridged = await bridgeNeonSession()
  if (bridged.ok && bridged.token) return bridged.token
  lastBridgeFailedAt = Date.now()
  return null
}

// Drop-in companion to getAuthHeaders (cookies.ts): same shape, but unifies
// identity first so Neon-only sessions act with full rights instead of
// failing as guests. Cheap when already unified (two cookie reads).
export async function getUnifiedAuthHeaders(): Promise<
  { authorization: string } | {}
> {
  const token = await ensureMedusaSession()
  if (!token) return {}
  return { authorization: `Bearer ${token}` }
}

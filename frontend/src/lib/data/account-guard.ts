import "server-only"

import { redirect } from "next/navigation"

import { hasAnySession } from "./cookies"
import { retrieveCustomer } from "./customer"

/**
 * Session-aware customer resolution for account pages. Never 404s on a
 * transient backend nap:
 * - customer loads      → return it
 * - session cookie set  → return null (page renders <AccountWarmup/> retry)
 * - no session at all   → redirect to sign in
 */
export async function requireAccountCustomer() {
  const customer = await retrieveCustomer().catch(() => null)
  if (customer) return { customer }
  if (await hasAnySession()) return { customer: null }
  // No session at all: the country proxy localizes this to /{cc}/account.
  redirect(`/account?mode=login`)
}

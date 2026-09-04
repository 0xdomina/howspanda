import { getLocaleHeader } from "@lib/util/get-locale-header"
import Medusa, { FetchArgs, FetchInput } from "@medusajs/js-sdk"

// The browser bundle cannot read server-only env vars. Keep the public URL
// explicit for client-side auth/store requests, while retaining the private
// server-side name for server actions and local development.
let MEDUSA_BACKEND_URL = (
  process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL ||
  process.env.MEDUSA_BACKEND_URL ||
  "http://localhost:9000"
)
  .replace(/\r|\n/g, "")
  .trim()
  .replace(/^['"]|['"]$/g, "")
  .replace(/\/$/, "")

export { MEDUSA_BACKEND_URL }

export const sdk = new Medusa({
  baseUrl: MEDUSA_BACKEND_URL,
  auth: {
    type: "session",
  },
  publishableKey: process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY,
})

const originalFetch = sdk.client.fetch.bind(sdk.client)

const READ_REQUEST_TIMEOUT_MS = 4_000
const WRITE_REQUEST_TIMEOUT_MS = 15_000

sdk.client.fetch = async <T>(
  input: FetchInput,
  init?: FetchArgs
): Promise<T> => {
  const headers = init?.headers ?? {}
  let localeHeader: Record<string, string | null> | undefined
  try {
    localeHeader = await getLocaleHeader()
    headers["x-medusa-locale"] ??= localeHeader["x-medusa-locale"]
  } catch {}

  const newHeaders = {
    ...localeHeader,
    ...headers,
  }
  init = {
    ...init,
    headers: newHeaders,
  }

  const controller = new AbortController()
  const timeoutMs =
    (init.method || "GET").toUpperCase() === "GET"
      ? READ_REQUEST_TIMEOUT_MS
      : WRITE_REQUEST_TIMEOUT_MS
  const timeout = setTimeout(() => controller.abort(), timeoutMs)

  try {
    return await originalFetch(input, {
      ...init,
      signal: init.signal ?? controller.signal,
    })
  } finally {
    clearTimeout(timeout)
  }
}

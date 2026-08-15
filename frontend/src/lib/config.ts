import { getLocaleHeader } from "@lib/util/get-locale-header"
import Medusa, { FetchArgs, FetchInput } from "@medusajs/js-sdk"

// Defaults to standard port for Medusa server
let MEDUSA_BACKEND_URL = "http://localhost:9000"

if (process.env.MEDUSA_BACKEND_URL) {
  MEDUSA_BACKEND_URL = process.env.MEDUSA_BACKEND_URL
}

// Circle programmable wallet configuration
// Set CIRCLE_API_BASE_URL and CIRCLE_ACCESS_TOKEN in .env
// CIRCLE_API_BASE_URL: Circle API base (default: https://api.circle.com)
// CIRCLE_ACCESS_TOKEN: Circle developer access token for programmable wallet
export { MEDUSA_BACKEND_URL }

export const circle = {
  // Base URL for Circle API - default to production
  get baseUrl(): string {
    return process.env.CIRCLE_API_BASE_URL ?? "https://api.circle.com"
  },
  // Access token for Circle programmable wallet
  get accessToken(): string | undefined {
    return process.env.CIRCLE_ACCESS_TOKEN
  },
  // Check if Circle is configured
  get isConfigured(): boolean {
    return !!process.env.CIRCLE_ACCESS_TOKEN
  },
}

// Export for convenience - whether Circle is configured
export const isCircleConfigured = () => circle.isConfigured

const originalFetch = sdk.client.fetch.bind(sdk.client)

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
  return originalFetch(input, init)
}

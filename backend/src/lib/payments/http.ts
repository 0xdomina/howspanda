/**
 * Tiny HTTP helper for payment gateways — global fetch + AbortController only.
 * No npm deps (CJS-safe; see Phase 3 lesson about ESM-only packages).
 */

export class PaymentHttpError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
    public readonly body?: string
  ) {
    super(message)
    this.name = "PaymentHttpError"
  }
}

async function requestJson(
  url: string,
  init: RequestInit,
  timeoutMs: number
): Promise<Record<string, any>> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  let response: Response
  try {
    response = await fetch(url, { ...init, signal: controller.signal })
  } catch (e: any) {
    throw new PaymentHttpError(
      `Payment HTTP request to ${url} failed: ${e?.message ?? e}`
    )
  } finally {
    clearTimeout(timer)
  }

  const text = await response.text()

  if (!response.ok) {
    throw new PaymentHttpError(
      `Payment HTTP request to ${url} returned ${response.status}: ${text.slice(0, 500)}`,
      response.status,
      text
    )
  }

  try {
    return text ? JSON.parse(text) : {}
  } catch {
    throw new PaymentHttpError(
      `Payment HTTP request to ${url} returned non-JSON body`,
      response.status,
      text
    )
  }
}

export async function postJson(
  url: string,
  body: Record<string, unknown>,
  headers: Record<string, string> = {},
  timeoutMs = 15000
): Promise<Record<string, any>> {
  return requestJson(
    url,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(body),
    },
    timeoutMs
  )
}

export async function getJson(
  url: string,
  headers: Record<string, string> = {},
  timeoutMs = 15000
): Promise<Record<string, any>> {
  return requestJson(url, { method: "GET", headers }, timeoutMs)
}

import { NextRequest, NextResponse } from "next/server"

export const runtime = "nodejs"

const BACKEND_URL = (
  process.env.MEDUSA_BACKEND_URL || "https://hows-u-api.onrender.com"
)
  .replace(/\r|\n/g, "")
  .trim()
  .replace(/^['"]|['"]$/g, "")
  .replace(/\/$/, "")

function validOrigin(request: NextRequest): boolean {
  const origin = request.headers.get("origin")
  return !origin || new URL(origin).host === request.headers.get("host")
}

export async function POST(request: NextRequest) {
  if (!validOrigin(request)) {
    return NextResponse.json({ message: "Invalid request origin." }, { status: 403 })
  }

  const body = (await request.json().catch(() => null)) as {
    address?: Record<string, unknown>
    addressId?: string
  } | null

  if (!body?.address || typeof body.address !== "object") {
    return NextResponse.json({ message: "Enter the required address details." }, { status: 400 })
  }

  // Single-identity rule: Neon and Medusa are companions. Accept the Medusa
  // JWT from a forwarded Authorization header (a server action may have just
  // bridged identity during this same request, so the cookie isn't set yet),
  // else the cookie — else bridge the Neon session inline right here instead
  // of failing with "sign in again".
  const forwardedAuth = request.headers.get("authorization")
  const headerToken =
    forwardedAuth?.toLowerCase().startsWith("bearer ")
      ? forwardedAuth.slice(7).trim()
      : null
  let token = headerToken || request.cookies.get("_medusa_jwt")?.value || null
  if (!token) {
    const neonSessionToken =
      request.cookies.get("__Secure-better-auth.session_token")?.value ||
      request.cookies.get("better-auth.session_token")?.value
    if (neonSessionToken) {
      try {
        const bridged = await fetch(`${BACKEND_URL}/store/auth/neon`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ sessionToken: neonSessionToken }),
          cache: "no-store",
          signal: AbortSignal.timeout(12_000),
        })
        const bridgedBody = (await bridged.json().catch(() => null)) as {
          token?: string
        } | null
        if (bridged.ok && bridgedBody?.token) token = bridgedBody.token
      } catch {
        // Backend unreachable — fall through to the 401 below.
      }
    }
  }
  const publishableKey = process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY
  if (!token || !publishableKey) {
    return NextResponse.json({ message: "Please sign in again to save your address." }, { status: 401 })
  }

  const path = body.addressId
    ? `/store/customers/me/addresses/${encodeURIComponent(body.addressId)}`
    : "/store/customers/me/addresses"

  try {
    const upstream = await fetch(`${BACKEND_URL}${path}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-publishable-api-key": publishableKey,
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body.address),
      cache: "no-store",
    })
    const responseBody = await upstream.text()
    return new NextResponse(responseBody || "{}", {
      status: upstream.status,
      headers: {
        "content-type": upstream.headers.get("content-type") || "application/json",
      },
    })
  } catch {
    return NextResponse.json(
      { message: "Address service is unavailable right now. Please try again shortly." },
      { status: 503 }
    )
  }
}

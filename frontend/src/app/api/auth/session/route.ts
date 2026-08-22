import { NextRequest, NextResponse } from "next/server"

const SESSION_MAX_AGE = 60 * 60 * 24 * 7
const ALLOWED_HOSTS = new Set([
  "hows-u.vercel.app",
  "localhost:8000",
  "localhost:3000",
])

function isSameSiteRequest(request: NextRequest) {
  const origin = request.headers.get("origin")
  if (!origin) return true

  try {
    const originUrl = new URL(origin)
    const requestHost = request.headers.get("host")
    return (
      originUrl.host === requestHost ||
      ALLOWED_HOSTS.has(originUrl.host)
    )
  } catch {
    return false
  }
}

export async function POST(request: NextRequest) {
  if (!isSameSiteRequest(request)) {
    return NextResponse.json({ message: "Invalid session origin." }, { status: 403 })
  }

  const body = (await request.json().catch(() => null)) as {
    token?: string
    actor?: "customer" | "seller"
  } | null

  if (!body?.token || body.token.length < 32 || body.token.length > 8192) {
    return NextResponse.json({ message: "Invalid session token." }, { status: 400 })
  }

  const response = NextResponse.json({ ok: true })
  const cookie = {
    maxAge: SESSION_MAX_AGE,
    httpOnly: true,
    sameSite: "strict" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
  }

  if (body.actor === "seller") {
    response.cookies.set("_medusa_seller_jwt", body.token, cookie)
  } else {
    response.cookies.set("_medusa_jwt", body.token, cookie)
  }

  return response
}

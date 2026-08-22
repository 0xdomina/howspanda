import { NextRequest, NextResponse } from "next/server"

const SESSION_MAX_AGE = 60 * 60 * 24 * 7

function isSameSiteRequest(request: NextRequest) {
  const origin = request.headers.get("origin")
  if (!origin) return true

  try {
    return new URL(origin).host === request.headers.get("host")
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
  response.cookies.set(
    body.actor === "seller" ? "_medusa_seller_jwt" : "_medusa_jwt",
    body.token,
    {
      maxAge: SESSION_MAX_AGE,
      httpOnly: true,
      sameSite: "strict",
      secure: process.env.NODE_ENV === "production",
      path: "/",
    }
  )
  return response
}

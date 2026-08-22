import { NextRequest, NextResponse } from "next/server"

export const runtime = "edge"

const BACKEND_URL = "https://hows-u-api-final.pandastack.app"
const SESSION_MAX_AGE = 60 * 60 * 24 * 7

export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin")
  if (origin && new URL(origin).host !== request.headers.get("host")) {
    return NextResponse.json({ message: "Invalid sign-in origin." }, { status: 403 })
  }

  const body = (await request.json().catch(() => null)) as {
    email?: string
    password?: string
  } | null
  const email = body?.email?.trim().toLowerCase()
  const password = body?.password

  if (!email || !password || email.length > 320 || password.length > 256) {
    return NextResponse.json({ message: "Enter your email and password to continue." }, { status: 400 })
  }

  let actor: "customer" | "seller" = "customer"
  let upstream: Response
  let result: { token?: string; message?: string } | null = null

  try {
    upstream = await fetch(`${BACKEND_URL}/auth/${actor}/emailpass`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password }),
      cache: "no-store",
    })
    result = (await upstream.json().catch(() => null)) as typeof result

    if (!upstream.ok) {
      actor = "seller"
      upstream = await fetch(`${BACKEND_URL}/auth/${actor}/emailpass`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password }),
        cache: "no-store",
      })
      result = (await upstream.json().catch(() => null)) as typeof result
    }
  } catch {
    return NextResponse.json({ message: "Sign-in is waking up. Please try again in a moment." }, { status: 503 })
  }

  if (!upstream.ok || !result?.token) {
    return NextResponse.json({ message: result?.message || "The email or password is incorrect." }, { status: 401 })
  }

  const response = NextResponse.json({ ok: true, actor })
  response.cookies.set(actor === "seller" ? "_medusa_seller_jwt" : "_medusa_jwt", result.token, {
    maxAge: SESSION_MAX_AGE,
    httpOnly: true,
    sameSite: "strict",
    secure: true,
    path: "/",
  })
  return response
}

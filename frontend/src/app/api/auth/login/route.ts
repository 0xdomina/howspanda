import { NextRequest, NextResponse } from "next/server"

export const runtime = "nodejs"

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
  let result: { token?: string; message?: string } = {}

  // Bounded: an unbounded backend fetch turns a sleepy backend into a Vercel
  // function timeout (504), which the form cannot distinguish from a refusal.
  const attempt = (a: "customer" | "seller") =>
    fetch(`${BACKEND_URL}/auth/${a}/emailpass`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password }),
      cache: "no-store",
      signal: AbortSignal.timeout(12000),
    })

  try {
    upstream = await attempt(actor)
    result = ((await upstream.json().catch(() => null)) as typeof result) || {}

    if (!upstream.ok) {
      actor = "seller"
      upstream = await attempt(actor)
      result = ((await upstream.json().catch(() => null)) as typeof result) || {}
    }
  } catch {
    return NextResponse.json({ message: "Sign-in is waking up. Please try again in a moment." }, { status: 503 })
  }

  // A 429 here is the brute-force throttle (20 tries / 15 min per email),
  // NOT wrong credentials — never report it as an incorrect password.
  if (upstream.status === 429) {
    return NextResponse.json(
      { message: "Too many sign-in attempts. Please wait a few minutes and try again.", rateLimited: true },
      { status: 429 }
    )
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

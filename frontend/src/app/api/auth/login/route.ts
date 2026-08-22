import { MEDUSA_BACKEND_URL } from "@lib/config"
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

async function authenticate(actor: "customer" | "seller", email: string, password: string) {
  const headers: Record<string, string> = { "content-type": "application/json" }
  const publishableKey =
    process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY ||
    process.env.MEDUSA_PUBLISHABLE_KEY

  if (publishableKey) {
    headers["x-publishable-api-key"] = publishableKey
  }

  const response = await fetch(`${MEDUSA_BACKEND_URL}/auth/${actor}/emailpass`, {
    method: "POST",
    headers,
    body: JSON.stringify({ email, password }),
    cache: "no-store",
  })

  const body = (await response.json().catch(() => null)) as {
    token?: string
  } | null

  return { response, token: body?.token }
}

export async function POST(request: NextRequest) {
  if (!isSameSiteRequest(request)) {
    return NextResponse.json({ message: "Invalid sign-in origin." }, { status: 403 })
  }

  const body = (await request.json().catch(() => null)) as {
    email?: string
    password?: string
  } | null
  const email = body?.email?.trim().toLowerCase()
  const password = body?.password

  if (!email || !password || email.length > 320 || password.length > 256) {
    return NextResponse.json(
      { message: "Enter your email and password to continue." },
      { status: 400 }
    )
  }

  try {
    let actor: "customer" | "seller" = "customer"
    let result = await authenticate(actor, email, password)

    if (result.response.status >= 500) {
      return NextResponse.json(
        { message: "Sign-in is temporarily unavailable. Please try again in a moment." },
        { status: 503 }
      )
    }

    if (!result.response.ok || !result.token) {
      actor = "seller"
      result = await authenticate(actor, email, password)
    }

    if (result.response.status >= 500 || !result.response.ok || !result.token) {
      return NextResponse.json(
        { message: "The email or password is incorrect." },
        { status: 401 }
      )
    }

    const response = NextResponse.json({ ok: true, actor })
    response.cookies.set(
      actor === "seller" ? "_medusa_seller_jwt" : "_medusa_jwt",
      result.token,
      {
        maxAge: SESSION_MAX_AGE,
        httpOnly: true,
        sameSite: "strict",
        secure: process.env.NODE_ENV === "production",
        path: "/",
      }
    )
    return response
  } catch {
    return NextResponse.json(
      { message: "Sign-in is temporarily unavailable. Please try again in a moment." },
      { status: 503 }
    )
  }
}

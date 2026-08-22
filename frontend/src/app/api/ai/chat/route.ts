import { NextRequest, NextResponse } from "next/server"

export const runtime = "edge"

const BACKEND_URL = "https://hows-u-api-final.pandastack.app"

function allowedOrigin(request: NextRequest): boolean {
  const origin = request.headers.get("origin")
  return !origin || new URL(origin).host === request.headers.get("host")
}

function upstreamHeaders(request: NextRequest): Headers {
  const headers = new Headers({ "content-type": "application/json" })
  const publishableKey = process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY
  const customerToken = request.cookies.get("_medusa_jwt")?.value

  if (publishableKey) headers.set("x-publishable-api-key", publishableKey)
  if (customerToken) headers.set("authorization", `Bearer ${customerToken}`)
  return headers
}

async function relay(upstream: Response): Promise<NextResponse> {
  const body = await upstream.text()
  return new NextResponse(body || "{}", {
    status: upstream.status,
    headers: {
      "content-type": upstream.headers.get("content-type") || "application/json",
    },
  })
}

export async function POST(request: NextRequest) {
  if (!allowedOrigin(request)) {
    return NextResponse.json({ message: "Invalid request origin." }, { status: 403 })
  }

  const body = await request.json().catch(() => null)
  if (!body || typeof body.message !== "string" || body.message.trim().length === 0) {
    return NextResponse.json({ message: "Ask a question to continue." }, { status: 400 })
  }

  try {
    const upstream = await fetch(`${BACKEND_URL}/store/ai/chat`, {
      method: "POST",
      headers: upstreamHeaders(request),
      body: JSON.stringify(body),
      cache: "no-store",
    })
    return relay(upstream)
  } catch {
    return NextResponse.json(
      { code: "ai_unavailable", message: "The assistant is unavailable right now. Please try again shortly." },
      { status: 503 }
    )
  }
}

export async function GET(request: NextRequest) {
  if (!allowedOrigin(request)) {
    return NextResponse.json({ message: "Invalid request origin." }, { status: 403 })
  }

  const query = request.nextUrl.searchParams.toString()
  const target = request.nextUrl.searchParams.has("conversation_id")
    ? "/store/ai/chat"
    : "/store/ai/chat/conversations"

  try {
    const upstream = await fetch(`${BACKEND_URL}${target}${query ? `?${query}` : ""}`, {
      method: "GET",
      headers: upstreamHeaders(request),
      cache: "no-store",
    })
    return relay(upstream)
  } catch {
    return NextResponse.json({ ok: false, messages: [] }, { status: 503 })
  }
}

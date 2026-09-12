import { NextRequest, NextResponse } from "next/server"

export const runtime = "nodejs"

// Same-origin proof-upload relay: the browser POSTs multipart here (no CORS,
// no presigned-URL expiry, no B2 reachability involved) and this route
// forwards the bytes to the backend's guest-compatible /store/uploads, which
// validates + stores into private B2 and returns the reference.
//
// Auth mirrors the addresses route: forwarded Bearer (freshly-bridged token),
// else the Medusa cookie, else an inline Neon bridge — never a dead end.

const BACKEND_URL = (
  process.env.MEDUSA_BACKEND_URL || "https://hows-u-api.onrender.com"
)
  .replace(/\r|\n/g, "")
  .trim()
  .replace(/^['"]|['"]$/g, "")
  .replace(/\/$/, "")

const IMAGE_MAX_BYTES = 10 * 1024 * 1024
const ALLOWED_MIME = new Set(["image/png", "image/jpeg", "image/webp"])

function validOrigin(request: NextRequest): boolean {
  const origin = request.headers.get("origin")
  return !origin || new URL(origin).host === request.headers.get("host")
}

async function resolveToken(request: NextRequest): Promise<string | null> {
  const forwardedAuth = request.headers.get("authorization")
  if (forwardedAuth?.toLowerCase().startsWith("bearer ")) {
    const token = forwardedAuth.slice(7).trim()
    if (token) return token
  }
  const cookieToken = request.cookies.get("_medusa_jwt")?.value
  if (cookieToken) return cookieToken
  const neonSessionToken =
    request.cookies.get("__Secure-better-auth.session_token")?.value ||
    request.cookies.get("better-auth.session_token")?.value
  if (!neonSessionToken) return null
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
    if (bridged.ok && bridgedBody?.token) return bridgedBody.token
  } catch {
    // Backend unreachable — caller surfaces the 401 below.
  }
  return null
}

export async function POST(request: NextRequest) {
  if (!validOrigin(request)) {
    return NextResponse.json({ message: "Invalid request origin." }, { status: 403 })
  }

  const publishableKey = process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY
  if (!publishableKey) {
    return NextResponse.json({ message: "Upload is unavailable right now." }, { status: 503 })
  }

  let file: File | null = null
  try {
    const form = await request.formData()
    const entry = form.get("file")
    if (entry instanceof File) file = entry
  } catch {
    return NextResponse.json({ message: "Could not read the uploaded file." }, { status: 400 })
  }
  if (!file || file.size < 1) {
    return NextResponse.json({ message: "Choose an image to upload." }, { status: 400 })
  }
  if (file.size > IMAGE_MAX_BYTES) {
    return NextResponse.json({ message: "File too large — max 10MB." }, { status: 400 })
  }
  if (!ALLOWED_MIME.has(file.type)) {
    return NextResponse.json(
      { message: "Only PNG, JPEG, and WebP images are accepted." },
      { status: 400 }
    )
  }

  const token = await resolveToken(request)

  try {
    const forward = new FormData()
    forward.append("file", file, file.name || "payment-proof.webp")
    const upstream = await fetch(`${BACKEND_URL}/store/uploads`, {
      method: "POST",
      headers: {
        "x-publishable-api-key": publishableKey,
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: forward,
      cache: "no-store",
    })
    const responseBody = await upstream.text()
    return new NextResponse(responseBody || "{}", {
      status: upstream.status,
      headers: {
        "content-type":
          upstream.headers.get("content-type") || "application/json",
      },
    })
  } catch {
    return NextResponse.json(
      { message: "Upload service is unavailable right now. Please try again shortly." },
      { status: 503 }
    )
  }
}

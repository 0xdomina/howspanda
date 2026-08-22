import { NextRequest, NextResponse } from "next/server"

export const runtime = "edge"

const BACKEND_URL = "https://hows-u-api-final.pandastack.app"

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

  const token = request.cookies.get("_medusa_jwt")?.value
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

import { NextResponse } from "next/server"

const BACKEND_URL = (
  process.env.MEDUSA_BACKEND_URL || "https://hows-u-api-final.pandastack.app"
)
  .replace(/\\r|\\n/g, "")
  .trim()
  .replace(/^['"]|['"]$/g, "")
  .replace(/\/$/, "")

export const dynamic = "force-dynamic"

const noStoreHeaders = {
  "Cache-Control": "no-store, no-cache, max-age=0",
}

const retryHeaders = {
  ...noStoreHeaders,
  "Retry-After": "5",
}

export async function GET() {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 8000)

  try {
    const response = await fetch(`${BACKEND_URL}/health`, {
      headers: {
        accept: "application/json",
        ...(process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY
          ? {
              "x-publishable-api-key":
                process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY,
            }
          : {}),
      },
      cache: "no-store",
      signal: controller.signal,
    })
    const body = (await response.json().catch(() => null)) as {
      ready?: boolean
    } | null
    const ready = response.ok && body?.ready === true

    return NextResponse.json(
      { ready },
      { status: ready ? 200 : 503, headers: ready ? noStoreHeaders : retryHeaders }
    )
  } catch {
    return NextResponse.json(
      { ready: false },
      { status: 503, headers: retryHeaders }
    )
  } finally {
    clearTimeout(timeout)
  }
}

import { NextResponse } from "next/server"

const BACKEND_URL =
  process.env.MEDUSA_BACKEND_URL || "https://hows-u-api-final.pandastack.app"

export const dynamic = "force-dynamic"

const noStoreHeaders = {
  "Cache-Control": "no-store, no-cache, max-age=0",
}

export async function GET() {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 8000)

  try {
    const response = await fetch(`${BACKEND_URL}/health`, {
      cache: "no-store",
      signal: controller.signal,
    })
    const body = (await response.json().catch(() => null)) as {
      ready?: boolean
    } | null
    const ready = response.ok && body?.ready === true

    return NextResponse.json(
      { ready },
      { status: ready ? 200 : 503, headers: noStoreHeaders }
    )
  } catch {
    return NextResponse.json(
      { ready: false },
      { status: 503, headers: noStoreHeaders }
    )
  } finally {
    clearTimeout(timeout)
  }
}

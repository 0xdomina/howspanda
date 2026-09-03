import { NextResponse } from "next/server"

export const dynamic = "force-dynamic"

const BACKEND_URL = (
  process.env.MEDUSA_BACKEND_URL || "https://hows-u-api-final.pandastack.app"
)
  .replace(/\r|\n/g, "")
  .trim()
  .replace(/^['"]|['"]$/g, "")
  .replace(/\/$/, "")

const PUB_KEY = process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY || ""

export async function GET() {
  const controller = new AbortController()
  const t = setTimeout(() => controller.abort(), 7000)
  try {
    // Harmless read - does not create data, just warms container + DB pool.
    // We hit health first then a tiny products read; both respect 30d media cache.
    const headers: Record<string, string> = { accept: "application/json" }
    if (PUB_KEY) headers["x-publishable-api-key"] = PUB_KEY

    const health = await fetch(`${BACKEND_URL}/health`, {
      headers,
      cache: "no-store",
      signal: controller.signal,
    }).then((r) => r.json().catch(() => null)).catch(() => null)

    // Only poke products if health responded (even if not ready) - cheap warm.
    let productsOk = false
    try {
      const r = await fetch(`${BACKEND_URL}/store/products?limit=1&fields=id`, {
        headers,
        cache: "no-store",
        signal: controller.signal,
      })
      productsOk = r.ok
    } catch {
      // ignore - health check already did its job
    }

    return NextResponse.json(
      { ok: true, health, productsOk },
      { headers: { "Cache-Control": "no-store" } }
    )
  } catch {
    return NextResponse.json({ ok: false }, { status: 503, headers: { "Cache-Control": "no-store", "Retry-After": "5" } })
  } finally {
    clearTimeout(t)
  }
}

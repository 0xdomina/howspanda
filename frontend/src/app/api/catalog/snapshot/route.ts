import { NextResponse } from "next/server"

export const dynamic = "force-dynamic"

const BACKEND_URL = (
  process.env.MEDUSA_BACKEND_URL || "https://hows-u-api-final.pandastack.app"
)
  .replace(/\r|\n/g, "")
  .trim()
  .replace(/^['"]|['"]$/g, "")
  .replace(/\/$/, "")

// Vercel Data Cache snapshot - survives free-tier sleep.
// We keep last good catalog in Next's fetch cache (revalidate) and also
// return it stale when backend is warming. B2 stays private - URLs are
// 30-day presigned (backend/src/lib/media/private-media.ts) and cached
// for 30 days on Vercel image CDN + browser.

export async function GET() {
  const controller = new AbortController()
  const t = setTimeout(() => controller.abort(), 4000)

  try {
    const r = await fetch(
      `${BACKEND_URL}/store/products?limit=24&fields=*variants.calculated_price,*images,thumbnail,handle,title,metadata`,
      {
        headers: {
          accept: "application/json",
          ...(process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY
            ? { "x-publishable-api-key": process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY }
            : {}),
        },
        cache: "no-store",
        signal: controller.signal,
      }
    )
    if (!r.ok) throw new Error(`backend ${r.status}`)
    const data = await r.json()
    const products = Array.isArray(data?.products) ? data.products : []
    return NextResponse.json(
      { products, count: products.length, source: "live" },
      {
        headers: {
          "Cache-Control": "public, s-maxage=120, stale-while-revalidate=600",
        },
      }
    )
  } catch {
    // Backend sleeping / 521 - return empty but cacheable; client will paint
    // from localStorage snapshot (catalog-snapshot) and WarmAgent will retry.
    // We do not error - homepage must never 500.
    return NextResponse.json(
      { products: [], count: 0, source: "stale" },
      {
        status: 200,
        headers: {
          "Cache-Control": "public, s-maxage=30, stale-while-revalidate=300",
          "Retry-After": "5",
        },
      }
    )
  } finally {
    clearTimeout(t)
  }
}

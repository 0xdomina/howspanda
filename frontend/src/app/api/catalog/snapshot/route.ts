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
  // Free-tier backend (0.1 CPU + cold Postgres) can take 10s+ for priced
  // queries on wake. SWR cache (s-maxage=120) means one slow success feeds
  // minutes of instant homepages; the WarmAgent retries every 20s anyway.
  const headers: Record<string, string> = {
    accept: "application/json",
    ...(process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY
      ? { "x-publishable-api-key": process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY }
      : {}),
  }

  try {
    // Priced fields require a region_id — resolve the default region first.
    const regionCtrl = new AbortController()
    const regionTimer = setTimeout(() => regionCtrl.abort(), 5000)
    // Prices are per-region (NG region carries the NGN prices; the EU region
    // has none). Prefer the storefront default country, else first region.
    const defaultCountry = (process.env.NEXT_PUBLIC_DEFAULT_REGION || "ng").toLowerCase()
    let regionId = ""
    try {
      const rr = await fetch(`${BACKEND_URL}/store/regions`, {
        headers,
        cache: "no-store",
        signal: regionCtrl.signal,
      })
      const rj = (await rr.json().catch(() => null)) as {
        regions?: { id: string; countries?: { iso_2?: string }[] }[]
      } | null
      const regions = rj?.regions ?? []
      regionId =
        regions.find((r) =>
          (r.countries ?? []).some((c) => (c.iso_2 ?? "").toLowerCase() === defaultCountry)
        )?.id ?? regions[0]?.id ?? ""
    } finally {
      clearTimeout(regionTimer)
    }
    if (!regionId) throw new Error("no region")

    const controller = new AbortController()
    const t = setTimeout(() => controller.abort(), 15000)
    let r: Response
    try {
      r = await fetch(
        `${BACKEND_URL}/store/products?limit=24&region_id=${encodeURIComponent(regionId)}&fields=*variants.calculated_price,*images,thumbnail,handle,title,metadata`,
        {
          headers,
          cache: "no-store",
          signal: controller.signal,
        }
      )
    } finally {
      clearTimeout(t)
    }
    if (!r.ok) throw new Error(`backend ${r.status}`)
    const data = await r.json()
    // Rebase pre-Render absolute PandaStack media URLs to the live backend.
    const raw = Array.isArray(data?.products) ? data.products : []
    const products = raw.map((p: any) => {
      if (p && typeof p.thumbnail === "string") {
        for (const host of [
          "https://hows-u-api-final.pandastack.app",
          "https://hows-u-api.pandastack.app",
        ]) {
          if (p.thumbnail.startsWith(host + "/")) {
            return { ...p, thumbnail: BACKEND_URL + p.thumbnail.slice(host.length) }
          }
        }
      }
      return p
    })
    return NextResponse.json(
      { products, count: products.length, source: "live" },
      {
        headers: {
          "Cache-Control": "public, s-maxage=120, stale-while-revalidate=600",
        },
      }
    )
  } catch {
    // Backend sleeping / error - return empty but cacheable; client will paint
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
  }
}

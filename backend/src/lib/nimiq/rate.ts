import { MedusaError } from "@medusajs/framework/utils"

// Live USDT/NGN rate. Rules that protect the platform:
// - Server-side only. The client never supplies a rate.
// - CoinGecko free endpoint (no key), cached 60s in memory.
// - Static env fallback (NIMIQ_USDT_NGN_RATE) when the fetch fails.
// - Fail-closed when both are missing/stale — never quote blind.
// - A spread buffer (default 1%) covers intra-quote drift so normal
//   volatility cannot turn a settled order into a loss.

const GECKO_URL =
  "https://api.coingecko.com/api/v3/simple/price?ids=tether&vs_currencies=ngn"
const CACHE_TTL_MS = 60 * 1000
const MAX_STALE_MS = 30 * 60 * 1000
const FETCH_TIMEOUT_MS = 8_000

let cached: { rate: number; at: number } | null = null

function spreadBps(): number {
  const bps = Number(process.env.NIMIQ_RATE_SPREAD_BPS)
  if (!Number.isFinite(bps) || bps < 0) return 100
  return Math.min(bps, 1000)
}

async function fetchLiveRate(): Promise<number | null> {
  try {
    const res = await fetch(GECKO_URL, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    })
    if (!res.ok) return null
    const body = (await res.json().catch(() => null)) as {
      tether?: { ngn?: number }
    } | null
    const rate = Number(body?.tether?.ngn)
    return Number.isFinite(rate) && rate > 0 ? rate : null
  } catch {
    return null
  }
}

function staticFallback(): number | null {
  const r = Number(process.env.NIMIQ_USDT_NGN_RATE)
  return Number.isFinite(r) && r > 0 ? r : null
}

/** Mid rate before spread (for display/diagnostics). */
export async function usdtNgnMidRate(): Promise<number> {
  const now = Date.now()
  if (cached && now - cached.at < CACHE_TTL_MS) return cached.rate
  const live = await fetchLiveRate()
  if (live != null) {
    cached = { rate: live, at: now }
    return live
  }
  if (cached && now - cached.at < MAX_STALE_MS) return cached.rate
  const fallback = staticFallback()
  if (fallback != null) return fallback
  throw new MedusaError(
    MedusaError.Types.INVALID_DATA,
    "Pricing is unavailable right now"
  )
}

/** Quoting rate: mid + spread buffer, rounded to 2dp. */
export async function usdtNgnRate(): Promise<number> {
  const mid = await usdtNgnMidRate()
  const quoted = mid * (1 + spreadBps() / 10_000)
  return Math.round(quoted * 100) / 100
}

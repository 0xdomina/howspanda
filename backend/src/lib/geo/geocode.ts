/**
 * Location helpers — forward/reverse geocoding via OpenStreetMap Nominatim and
 * straight-line (Haversine) distance. Zero npm deps (CJS-safe global fetch).
 *
 * Nominatim usage policy: max 1 request/sec, include a valid User-Agent, and
 * cache results. We cache in-process keyed by the normalized query string.
 */

export type GeoPoint = {
  lat: number
  lng: number
}

export type GeocodeResult = {
  lat: number
  lng: number
  displayName: string
  city?: string | null
  country?: string | null
}

const NOMINATIM_BASE = "https://nominatim.openstreetmap.org"
const USER_AGENT = "howsu-app/1.0 (p2p-delivery; contact: support@howsu.app)"

// In-process LRU-ish cache: query -> geocode result (or null sentinel for misses).
const cache = new Map<string, GeocodeResult | null>()
const CACHE_MAX = 512

function cacheSet(key: string, value: GeocodeResult | null) {
  if (cache.size >= CACHE_MAX) {
    const oldest = cache.keys().next().value
    if (oldest) cache.delete(oldest)
  }
  cache.set(key, value)
}

function normalizeQuery(query: string): string {
  return query.trim().replace(/\s+/g, " ").toLowerCase()
}

async function nominatimSearch(params: Record<string, string>): Promise<any> {
  const qs = new URLSearchParams({
    format: "json",
    limit: "1",
    addressdetails: "1",
    ...params,
  })
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 15000)
  try {
    const res = await fetch(`${NOMINATIM_BASE}/search?${qs.toString()}`, {
      headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
      signal: controller.signal,
    })
    if (!res.ok) {
      throw new Error(`Nominatim search returned ${res.status}`)
    }
    return await res.json()
  } finally {
    clearTimeout(timer)
  }
}

function toResult(place: any): GeocodeResult {
  const address = place?.address ?? {}
  return {
    lat: Number(place.lat),
    lng: Number(place.lon),
    displayName: place.display_name ?? "",
    city: address.city ?? address.town ?? address.village ?? null,
    country: address.country ?? null,
  }
}

/**
 * Forward geocode an address string to coordinates. Returns null when the
 * address cannot be resolved to a location. Nominatim rate-limits to ~1
 * request/second and throttles bursts, so a failed first attempt is retried
 * once after a short backoff before giving up.
 */
export async function geocodeAddress(
  address: string
): Promise<GeocodeResult | null> {
  if (!address?.trim()) return null
  const key = normalizeQuery(address)
  if (cache.has(key)) return cache.get(key) ?? null

  let result: GeocodeResult | null = null
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const results = await nominatimSearch({ q: address.trim() })
      if (Array.isArray(results) && results.length > 0) {
        result = toResult(results[0])
        break
      }
    } catch {
      // Network/geocoder failure — retry once, then give up (uncached).
    }
    if (attempt === 0) {
      await new Promise((r) => setTimeout(r, 1100))
    }
  }
  cacheSet(key, result)
  return result
}

/**
 * Reverse geocode a coordinate pair into a structured address.
 */
export async function reverseGeocode(
  lat: number,
  lng: number
): Promise<GeocodeResult | null> {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
  const key = `rev:${lat.toFixed(6)},${lng.toFixed(6)}`
  if (cache.has(key)) return cache.get(key) ?? null

  let result: GeocodeResult | null = null
  try {
    const qs = new URLSearchParams({
      format: "json",
      lat: String(lat),
      lon: String(lng),
      addressdetails: "1",
    })
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 15000)
    try {
      const res = await fetch(`${NOMINATIM_BASE}/reverse?${qs.toString()}`, {
        headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
        signal: controller.signal,
      })
      if (res.ok) {
        const place = await res.json()
        if (place?.lat && place?.lon) {
          result = {
            ...toResult(place),
            lat: Number.isFinite(Number(place.lat))
              ? Number(place.lat)
              : lat,
            lng: Number.isFinite(Number(place.lon))
              ? Number(place.lon)
              : lng,
          }
        }
      }
    } finally {
      clearTimeout(timer)
    }
  } catch {
    return null
  }
  cacheSet(key, result)
  return result
}

/** Great-circle distance between two points in kilometers. */
export function haversineKm(a: GeoPoint, b: GeoPoint): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180
  const R = 6371
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(s))
}

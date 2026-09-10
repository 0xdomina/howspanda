import { MEDUSA_BACKEND_URL } from "@lib/config"

// Product media created before the Render migration stores absolute
// PandaStack URLs (thumbnail, images[].url, variants[].images[].url,
// metadata.homepage_banner_image, ...). PandaStack is retired — rebase those
// origins onto the live backend so the /media proxy (same code, same B2 keys)
// keeps serving them. B2 presigned URLs and all other hosts pass through.
//
// Deep-walk: new media fields must keep working without code changes here.
const LEGACY_MEDIA_HOSTS = [
  "https://hows-u-api-final.pandastack.app",
  "http://hows-u-api-final.pandastack.app",
  "https://hows-u-api.pandastack.app",
  "http://hows-u-api.pandastack.app",
]

// Belt-and-braces: a few rows were once stored as bare-host URLs without the
// /media/ proxy segment (since repaired in-DB). Repair on the fly so no
// render can ever 404 on them again.
const LIVE_BACKEND_HOSTS = [
  "https://hows-u-api.onrender.com",
  "http://hows-u-api.onrender.com",
]

export const rebaseMediaUrl = (
  url: string | null | undefined
): string | null => {
  if (!url || typeof url !== "string") return url ?? null
  for (const host of LEGACY_MEDIA_HOSTS) {
    if (url.startsWith(host + "/")) {
      return MEDUSA_BACKEND_URL + url.slice(host.length)
    }
  }
  for (const host of LIVE_BACKEND_HOSTS) {
    const rest = url.startsWith(host + "/") ? url.slice(host.length + 1) : null
    if (rest !== null) {
      const [first] = rest.split("/", 1)
      let decoded = first
      try {
        decoded = decodeURIComponent(first)
      } catch {
        // keep raw segment
      }
      if (decoded !== "media") {
        return `${host}/media/${rest}`
      }
    }
  }
  return url
}

const rebaseDeep = (value: unknown): unknown => {
  if (typeof value === "string") {
    return rebaseMediaUrl(value)
  }
  if (Array.isArray(value)) return value.map(rebaseDeep)
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value)) out[k] = rebaseDeep(v)
    return out
  }
  return value
}

export const rebaseProductMedia = <T>(product: T): T => {
  if (!product || typeof product !== "object") return product
  return rebaseDeep(product) as T
}

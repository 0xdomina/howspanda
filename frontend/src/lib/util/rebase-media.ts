"use server"

import { MEDUSA_BACKEND_URL } from "@lib/config"

// Product media created before the Render migration stores absolute
// PandaStack URLs (thumbnail + images). PandaStack is retired — rebase those
// origins onto the live backend so the /media proxy (same code, same B2 keys)
// keeps serving them. B2 presigned URLs and all other hosts pass through.
const LEGACY_MEDIA_HOSTS = [
  "https://hows-u-api-final.pandastack.app",
  "http://hows-u-api-final.pandastack.app",
  "https://hows-u-api.pandastack.app",
  "http://hows-u-api.pandastack.app",
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
  return url
}

export const rebaseProductMedia = <T extends { thumbnail?: string | null; images?: { url: string }[] | null }>(
  product: T
): T => {
  if (!product || typeof product !== "object") return product
  const next = { ...product } as T
  if (typeof next.thumbnail === "string") {
    next.thumbnail = rebaseMediaUrl(next.thumbnail) as T["thumbnail"]
  }
  if (Array.isArray(next.images)) {
    next.images = next.images.map((img) =>
      img && typeof img.url === "string" ? { ...img, url: rebaseMediaUrl(img.url) ?? img.url } : img
    )
  }
  return next
}

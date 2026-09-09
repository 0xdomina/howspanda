import "server-only"

import { revalidateTag } from "next/cache"

/**
 * Guest requests do not have a cache-id cookie, so their cache tag is empty.
 * Next.js rejects an empty tag; skip it while still invalidating personalized
 * tags for signed-in users.
 */
export const revalidateTagSafely = (tag?: string | null) => {
  if (!tag?.trim()) return
  revalidateTag(tag, "max")
}

// Shared catalog tag, used by every PUBLIC product listing (homepage,
// store, search) instead of per-visitor tags. Mutations revalidate this one
// tag so a new product appears for everyone immediately — per-visitor tags
// meant only the acting seller's own cache ever busted, leaving stale
// listings pinned for days whenever background revalidation hit a sleeping
// backend.
export const PUBLIC_PRODUCTS_TAG = "public-products"

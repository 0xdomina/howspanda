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

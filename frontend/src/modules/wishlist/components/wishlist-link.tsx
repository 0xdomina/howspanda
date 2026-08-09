"use client"

import LocalizedClientLink from "@modules/common/components/localized-client-link"
import { useWishlist } from "../context"

export default function WishlistLink() {
  const { items } = useWishlist()

  return (
    <LocalizedClientLink href="/wishlist" aria-label={`Wishlist${items.length ? ` (${items.length} saved)` : ""}`} className="relative grid h-8 w-8 place-items-center rounded-full border border-ink-hairline text-lg transition-transform duration-fast active:scale-95">
      ♡
      {items.length > 0 && <span className="absolute -right-1 -top-1 grid h-4 min-w-4 place-items-center rounded-full bg-brand px-1 text-[10px] font-semibold text-white">{items.length}</span>}
    </LocalizedClientLink>
  )
}

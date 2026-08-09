"use client"

import { WishlistItem, useWishlist } from "../context"

export default function WishlistButton({ item }: { item: WishlistItem }) {
  const { has, toggle } = useWishlist()
  const saved = has(item.id)

  return (
    <button type="button" aria-label={saved ? `Remove ${item.title} from wishlist` : `Add ${item.title} to wishlist`} aria-pressed={saved} onClick={() => toggle(item)} className={`grid h-8 w-8 place-items-center rounded-full bg-white text-lg transition-all duration-fast active:scale-95 ${saved ? "text-brand" : "text-ink"}`}>
      {saved ? "♥" : "♡"}
    </button>
  )
}

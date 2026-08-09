"use client"

import LocalizedClientLink from "@modules/common/components/localized-client-link"
import { useWishlist } from "../context"

export default function WishlistPage() {
  const { items, remove, clear } = useWishlist()

  return (
    <div className="figma-container py-12 small:py-20">
      <div className="flex items-end justify-between gap-4">
        <div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-brand">Saved for later</p><h1 className="mt-2 font-display text-4xl font-semibold tracking-tight text-ink">Wishlist</h1></div>
        {items.length > 0 && <button type="button" onClick={clear} className="text-sm text-ink-muted underline underline-offset-4 hover:text-ink">Clear all</button>}
      </div>
      {items.length === 0 ? (
        <div className="mt-10 rounded-control border border-dashed border-ink-hairline p-10 text-center"><h2 className="font-display text-2xl font-semibold text-ink">Nothing saved yet</h2><p className="mt-2 text-sm text-ink-muted">Tap the heart on any product to keep it close.</p><LocalizedClientLink href="/store" className="figma-button mt-6">Explore products</LocalizedClientLink></div>
      ) : (
        <div className="mt-10 grid grid-cols-2 gap-4 small:grid-cols-4 small:gap-7">{items.map((item) => <article key={item.id} className="group"><LocalizedClientLink href={item.handle ? `/products/${item.handle}` : "/store"} className="block overflow-hidden rounded-control bg-[#f5f5f5]">{item.thumbnail ? <img src={item.thumbnail} alt="" className="aspect-square h-full w-full object-contain p-5 transition-transform duration-moderate group-hover:scale-105" /> : <div className="aspect-square" />}</LocalizedClientLink><div className="mt-4 flex items-start justify-between gap-3"><div><h2 className="text-sm font-medium text-ink">{item.title}</h2>{item.price && <p className="mt-2 text-sm font-semibold text-brand">{item.price}</p>}</div><button type="button" onClick={() => remove(item.id)} aria-label={`Remove ${item.title} from wishlist`} className="text-sm text-ink-muted hover:text-brand">Remove</button></div></article>)}</div>
      )}
    </div>
  )
}

"use client"

/* The cached fallback intentionally uses the browser image cache directly.
 * This keeps previously loaded storefront media visible even when a media
 * host is not available to Next's image optimizer during a cold start. */
/* eslint-disable @next/next/no-img-element */

import type { HttpTypes } from "@medusajs/types"
import { useEffect, useState } from "react"

import LocalizedClientLink from "@modules/common/components/localized-client-link"

const STORAGE_KEY = "hows-u:public-catalog:v1"
const MAX_ITEMS = 24

type CatalogItem = {
  id: string
  handle: string
  title: string
  thumbnail: string | null
  price: string | null
}

function formatPrice(product: HttpTypes.StoreProduct) {
  const variant = product.variants?.find((item: any) => item.calculated_price)
  const price = (variant as any)?.calculated_price

  if (!price || typeof price.calculated_amount !== "number") return null

  try {
    return new Intl.NumberFormat("en-NG", {
      style: "currency",
      currency: price.currency_code || "NGN",
      maximumFractionDigits: 2,
    }).format(price.calculated_amount)
  } catch {
    return null
  }
}

function toSnapshot(products: HttpTypes.StoreProduct[]): CatalogItem[] {
  return products.slice(0, MAX_ITEMS).map((product) => ({
    id: product.id,
    handle: product.handle,
    title: product.title,
    thumbnail: product.thumbnail || product.images?.[0]?.url || null,
    price: formatPrice(product),
  }))
}

function readSnapshot(): CatalogItem[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter(
      (item): item is CatalogItem =>
        item &&
        typeof item.id === "string" &&
        typeof item.handle === "string" &&
        typeof item.title === "string"
    )
  } catch {
    return []
  }
}

function SnapshotGrid({ items }: { items: CatalogItem[] }) {
  return (
    <section className="figma-container py-12 small:py-16" aria-label="Recently viewed catalog">
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="mb-2 text-sm font-semibold text-brand">Your marketplace</p>
          <h2 className="font-display text-3xl font-semibold tracking-tight text-ink">
            Browse while we refresh
          </h2>
        </div>
        <span className="hidden text-xs text-ink-muted small:inline">Fresh prices load automatically</span>
      </div>
      <div className="mt-8 grid grid-cols-2 gap-x-4 gap-y-10 small:grid-cols-4 small:gap-x-7">
        {items.slice(0, 8).map((item) => (
          <article key={item.id} className="group min-w-0">
            <LocalizedClientLink
              href={`/products/${item.handle}`}
              className="block overflow-hidden rounded-control border border-ink-hairline bg-[#f5f5f5] focus:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-4"
              aria-label={`View ${item.title}`}
            >
              <div className="relative aspect-[9/11] overflow-hidden">
                {item.thumbnail ? (
                  <img
                    src={item.thumbnail}
                    alt=""
                    loading="lazy"
                    decoding="async"
                    className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-[1.03]"
                    onError={(event) => {
                      event.currentTarget.style.display = "none"
                    }}
                  />
                ) : null}
              </div>
            </LocalizedClientLink>
            <div className="mt-3 flex items-start justify-between gap-2">
              <h3 className="min-w-0 text-sm font-medium leading-snug text-ink">{item.title}</h3>
              {item.price && <span className="shrink-0 text-xs font-medium text-ink">{item.price}</span>}
            </div>
          </article>
        ))}
      </div>
    </section>
  )
}

function LoadingCatalog() {
  return (
    <section className="figma-container py-16 small:py-24" aria-live="polite" aria-label="Loading catalog">
      <div className="soft-glass rounded-[24px] p-6 small:p-8">
        <p className="text-sm font-semibold text-brand">Fresh finds are on the way</p>
        <h2 className="mt-2 font-display text-3xl font-semibold tracking-tight text-ink">Opening the marketplace</h2>
        <p className="mt-3 max-w-lg text-sm leading-6 text-ink-muted">
          You can start exploring as the latest catalog comes in. This usually takes only a moment.
        </p>
        <div className="mt-8 grid grid-cols-2 gap-4 small:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="aspect-[9/11] animate-pulse rounded-control bg-ink/5" />
          ))}
        </div>
      </div>
    </section>
  )
}

export default function CatalogSnapshot({ products }: { products: HttpTypes.StoreProduct[] }) {
  const [snapshot, setSnapshot] = useState<CatalogItem[] | null>(null)

  useEffect(() => {
    if (products.length) {
      const next = toSnapshot(products)
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
      } catch {
        // Storage is an enhancement. The live server-rendered catalog remains authoritative.
      }
      return
    }

    const timer = window.setTimeout(() => setSnapshot(readSnapshot()), 0)
    return () => window.clearTimeout(timer)
  }, [products])

  if (products.length) return null
  if (snapshot === null) return <LoadingCatalog />
  if (snapshot.length) return <SnapshotGrid items={snapshot} />

  return (
    <section className="figma-container py-16 small:py-24">
      <div className="soft-glass rounded-[24px] p-6 text-center small:p-10">
        <h2 className="font-display text-3xl font-semibold tracking-tight text-ink">The marketplace is getting ready</h2>
        <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-ink-muted">
          Hang tight for a moment. New products will appear here automatically.
        </p>
      </div>
    </section>
  )
}

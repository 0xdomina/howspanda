"use client"

import Image from "next/image"
import { useEffect, useState } from "react"
import type { HttpTypes } from "@medusajs/types"

import LocalizedClientLink from "@modules/common/components/localized-client-link"

// Seller banner images show exactly as uploaded: no headline, no gradient,
// no dimming. The whole slide links to the product; only the pager dots sit
// on top (bottom center) so nothing covers the artwork.
export default function PromoBannerCarousel({
  products,
  countryCode,
}: {
  products: HttpTypes.StoreProduct[]
  countryCode: string
}) {
  const [active, setActive] = useState(0)
  const [paused, setPaused] = useState(false)
  const slides = products.slice(0, 5)

  useEffect(() => {
    if (slides.length <= 1 || paused) return
    const timer = window.setInterval(() => {
      setActive((current) => (current + 1) % slides.length)
    }, 5000)
    return () => window.clearInterval(timer)
  }, [slides.length, paused])

  if (!slides.length) return null

  const bannerImageOf = (p: HttpTypes.StoreProduct) =>
    typeof p.metadata?.homepage_banner_image === "string"
      ? (p.metadata.homepage_banner_image as string)
      : p.thumbnail

  return (
    <section className="figma-container pt-8 small:pt-12" aria-label="Featured products">
      <div
        className="relative min-h-[360px] overflow-hidden rounded-[28px] bg-ink/5 shadow-float small:min-h-[430px]"
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}
        onFocus={() => setPaused(true)}
        onBlur={() => setPaused(false)}
      >
        {slides.map((slide, index) => {
          const src = bannerImageOf(slide)
          if (!src) return null
          const isActive = index === active
          return (
            <LocalizedClientLink
              key={slide.id}
              href={`/products/${slide.handle}`}
              aria-label={`Shop ${slide.title}`}
              aria-hidden={isActive ? undefined : true}
              tabIndex={isActive ? undefined : -1}
              className={
                "absolute inset-0 transition-opacity duration-700 " +
                (isActive ? "opacity-100" : "pointer-events-none opacity-0")
              }
            >
              <Image
                src={src}
                alt={slide.title}
                fill
                priority={index === 0}
                loading={index === 0 ? undefined : "lazy"}
                fetchPriority={index === 0 ? "high" : "low"}
                sizes="(max-width: 768px) 100vw, 1200px"
                className="object-cover object-center"
              />
            </LocalizedClientLink>
          )
        })}
        <div className="absolute inset-x-0 bottom-4 flex items-center justify-center" role="tablist" aria-label="Featured product banners">
          <div className="flex items-center gap-2 rounded-full bg-black/30 px-3 py-2 backdrop-blur-sm">
          {slides.map((slide, index) => (
            <button
              key={slide.id}
              type="button"
              role="tab"
              aria-label={`Show featured product ${index + 1}: ${slide.title}`}
              aria-selected={index === active}
              onClick={() => setActive(index)}
              className={`h-1.5 rounded-full transition-all duration-200 ${index === active ? "w-10 bg-white" : "w-5 bg-white/60 hover:bg-white"}`}
            />
          ))}
          </div>
        </div>
      </div>
    </section>
  )
}

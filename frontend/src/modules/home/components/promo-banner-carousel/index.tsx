"use client"

import Image from "next/image"
import { useEffect, useState } from "react"
import type { HttpTypes } from "@medusajs/types"

import LocalizedClientLink from "@modules/common/components/localized-client-link"
import ShareButton from "@modules/common/components/share-button"
import { getBaseURL } from "@lib/util/env"

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

  const product = slides[active] ?? slides[0]
  const bannerImageOf = (p: HttpTypes.StoreProduct) =>
    typeof p.metadata?.homepage_banner_image === "string"
      ? (p.metadata.homepage_banner_image as string)
      : p.thumbnail
  const bannerImage = bannerImageOf(product)

  return (
    <section className="figma-container pt-8 small:pt-12" aria-label="Featured products">
      <div
        className="relative min-h-[360px] overflow-hidden rounded-[28px] bg-ink text-paper shadow-float small:min-h-[430px]"
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}
        onFocus={() => setPaused(true)}
        onBlur={() => setPaused(false)}
      >
        {slides.map((slide, index) => {
          const src = bannerImageOf(slide)
          if (!src) return null
          return (
            <Image
              key={slide.id}
              src={src}
              alt={slide.title}
              fill
              priority={index === 0}
              loading={index === 0 ? undefined : "lazy"}
              fetchPriority={index === 0 ? "high" : "low"}
              sizes="(max-width: 768px) 100vw, 1200px"
              aria-hidden={index === active ? undefined : true}
              className={
                "object-cover object-center transition-opacity duration-700 " +
                (index === active ? "opacity-75" : "opacity-0")
              }
            />
          )
        })}
        <div className="absolute inset-0 bg-gradient-to-r from-black/80 via-black/45 to-black/10" />
        <div className="relative flex min-h-[360px] flex-col justify-between p-7 small:min-h-[430px] small:p-12">
          <div className="flex items-center justify-between gap-4 text-xs font-semibold uppercase tracking-[0.18em] text-white/75">
            <span>Featured on How’s U</span>
            <div className="flex items-center gap-3">
              <ShareButton
                entity="product"
                entityId={product.id}
                className="grid h-9 w-9 place-items-center rounded-full border border-white/30 bg-black/20 text-white backdrop-blur-sm transition-transform duration-200 hover:bg-black/30 active:scale-95"
                payload={{
                  url: `${getBaseURL()}/${countryCode}/products/${product.handle}`,
                  text: `${product.title} on How's u`,
                  title: product.title,
                  description:
                    product.description || "A fresh find from an independent seller on How's u.",
                  image: bannerImage ?? undefined,
                }}
              />
              <span>{String(active + 1).padStart(2, "0")} / {String(slides.length).padStart(2, "0")}</span>
            </div>
          </div>
          <div key={product.id} className="media-enter max-w-xl">
            <p className="mb-3 text-sm font-medium text-white/75">{product.title}</p>
            <h2 className="font-display text-4xl font-semibold tracking-tight text-white small:text-6xl">
              Fresh finds, made for your everyday.
            </h2>
            <p className="mt-5 max-w-md text-sm leading-6 text-white/75 small:text-base">
              Discover something new from independent sellers on How’s U.
            </p>
            <LocalizedClientLink href={`/products/${product.handle}`} className="mt-7 inline-flex rounded-full bg-white px-5 py-3 text-sm font-semibold text-ink transition-transform duration-200 hover:-translate-y-0.5">
              Shop this product
            </LocalizedClientLink>
          </div>
          <div className="flex items-center gap-2" role="tablist" aria-label="Featured product banners">
            {slides.map((slide, index) => (
              <button
                key={slide.id}
                type="button"
                role="tab"
                aria-label={`Show featured product ${index + 1}`}
                aria-selected={index === active}
                onClick={() => setActive(index)}
                className={`h-1.5 rounded-full transition-all duration-200 ${index === active ? "w-10 bg-white" : "w-5 bg-white/40 hover:bg-white/70"}`}
              />
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}

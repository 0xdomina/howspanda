"use client"

import { HttpTypes } from "@medusajs/types"
import Image from "next/image"
import { useMemo, useState } from "react"

type ImageGalleryProps = {
  images: HttpTypes.StoreProductImage[]
  videoUrl?: string | null
  title: string
}

type MediaItem =
  | { id: string; kind: "image"; url: string }
  | { id: string; kind: "video"; url: string }

const ImageGallery = ({ images, videoUrl, title }: ImageGalleryProps) => {
  const media = useMemo<MediaItem[]>(() => {
    const imageItems = images
      .filter((image) => Boolean(image.url))
      .map((image) => ({ id: image.id, kind: "image" as const, url: image.url }))

    return videoUrl
      ? [{ id: "product-video", kind: "video" as const, url: videoUrl }, ...imageItems]
      : imageItems
  }, [images, videoUrl])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const activeIndex = Math.max(
    0,
    media.findIndex((item) => item.id === selectedId)
  )

  const active = media[activeIndex]

  if (!active) {
    return (
      <div className="glass-panel grid aspect-[4/5] place-items-center rounded-control p-8 text-center">
        <div>
          <p className="font-display text-xl text-ink">{title}</p>
          <p className="mt-2 text-sm text-ink-muted">Product photos will be added soon.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-w-0 flex-col gap-3 small:flex-row-reverse">
      <div className="relative aspect-[4/5] min-w-0 flex-1 overflow-hidden rounded-control border border-ink-hairline bg-paper-tinted shadow-float">
        {active.kind === "video" ? (
          <video
            className="absolute inset-0 h-full w-full object-cover"
            src={active.url}
            controls
            playsInline
            muted
            loop
            preload="metadata"
            poster={images[0]?.url}
            data-testid="product-video"
          />
        ) : (
          <Image
            src={active.url}
            alt={`${title} — image ${activeIndex + 1}`}
            fill
            priority
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 58vw, 720px"
            className="object-cover"
          />
        )}
        <span className="absolute bottom-3 left-3 rounded-full bg-ink/70 px-3 py-1 text-xs font-medium text-paper backdrop-blur-sm">
          {active.kind === "video" ? "Product video" : `${activeIndex + 1} of ${media.length}`}
        </span>
      </div>

      {media.length > 1 ? (
        <div className="no-scrollbar flex gap-3 overflow-x-auto pb-1 small:w-20 small:flex-col small:overflow-y-auto small:pb-0">
          {media.map((item, index) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setSelectedId(item.id)}
              aria-label={item.kind === "video" ? "View product video" : `View image ${index + 1}`}
              aria-current={activeIndex === index}
              className={`relative h-20 w-16 shrink-0 overflow-hidden rounded-control border bg-paper-tinted transition-all duration-200 small:w-20 ${
                activeIndex === index
                  ? "border-brand ring-2 ring-brand/20"
                  : "border-ink-hairline hover:border-ink/40"
              }`}
            >
              {item.kind === "video" ? (
                <>
                  {images[0]?.url ? (
                    <Image src={images[0].url} alt="" fill sizes="80px" className="object-cover opacity-70" />
                  ) : null}
                  <span className="absolute inset-0 grid place-items-center bg-ink/35 text-xs font-semibold text-paper">Video</span>
                </>
              ) : (
                <Image src={item.url} alt="" fill sizes="80px" className="object-cover" />
              )}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}

export default ImageGallery

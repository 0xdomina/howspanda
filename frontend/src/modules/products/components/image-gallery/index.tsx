"use client"

import { HttpTypes } from "@medusajs/types"
import Image from "next/image"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"

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
      ? [...imageItems, { id: "product-video", kind: "video" as const, url: videoUrl }]
      : imageItems
  }, [images, videoUrl])

  const trackRef = useRef<HTMLDivElement>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)
  const dragRef = useRef({ startX: 0, startScroll: 0, moved: false })

  const activeIndex = Math.max(
    0,
    media.findIndex((item) => item.id === selectedId)
  )
  const active = media[activeIndex]

  const goToIndex = useCallback(
    (index: number, smooth = true) => {
      const track = trackRef.current
      if (!track) return
      const clamped = ((index % media.length) + media.length) % media.length
      const child = track.children[clamped] as HTMLElement | undefined
      if (!child) return
      setSelectedId(media[clamped].id)
      track.scrollTo({ left: child.offsetLeft, behavior: smooth ? "smooth" : "auto" })
    },
    [media]
  )

  // Keep the selected slide in view when the track mounts or media changes.
  useEffect(() => {
    if (!active) return
    const track = trackRef.current
    if (!track) return
    const child = track.children[activeIndex] as HTMLElement | undefined
    if (child && Math.abs(track.scrollLeft - child.offsetLeft) > 4) {
      track.scrollTo({ left: child.offsetLeft, behavior: "auto" })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [media.length])

  const onScroll = useCallback(() => {
    // Selection always follows the nearest slide — during swipes, drags, and
    // programmatic scrolls alike. Thumbnails highlight in passing.
    const track = trackRef.current
    if (!track || track.children.length === 0) return
    const first = track.children[0] as HTMLElement
    const step = first.offsetWidth || 1
    const current = Math.min(
      media.length - 1,
      Math.max(0, Math.round(track.scrollLeft / step))
    )
    if (media[current] && media[current].id !== selectedId) {
      setSelectedId(media[current].id)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [media, selectedId])

  // Touch swipe — native via scroll-snap; we only track selection.
  const onTouchStart = useCallback(() => {}, [])

  // Desktop drag-to-swipe
  const onMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (e.button !== 0) return
      const track = trackRef.current
      if (!track) return
      dragRef.current = { startX: e.clientX, startScroll: track.scrollLeft, moved: false }
      setDragging(true)
      track.classList.add("media-animating") // instant follow while dragging
    },
    []
  )
  const onMouseMove = useCallback(
    (e: React.MouseEvent) => {
      const track = trackRef.current
      if (!dragging || !track) return
      const dx = e.clientX - dragRef.current.startX
      if (Math.abs(dx) > 4) dragRef.current.moved = true
      track.scrollLeft = dragRef.current.startScroll - dx
    },
    [dragging]
  )
  const endDrag = useCallback(() => {
    const track = trackRef.current
    if (!dragging || !track) return
    setDragging(false)
    track.classList.remove("media-animating")
    if (!dragRef.current.moved) return
    // Snap to the nearest slide after a drag, honouring flick intent.
    const first = track.children[0] as HTMLElement
    const step = first.offsetWidth || 1
    const raw = track.scrollLeft / step
    const target = Math.abs(raw - Math.round(raw)) > 0.18
      ? (raw > Math.round(raw) ? Math.ceil(raw) : Math.floor(raw))
      : Math.round(raw)
    goToIndex(target)
  }, [dragging, goToIndex])

  // Keyboard arrows when the gallery has focus
  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "ArrowRight") { e.preventDefault(); goToIndex(activeIndex + 1) }
      if (e.key === "ArrowLeft") { e.preventDefault(); goToIndex(activeIndex - 1) }
    },
    [activeIndex, goToIndex]
  )

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
      {/* Swipe / drag stage */}
      <div
        ref={trackRef}
        onScroll={onScroll}
        onTouchStart={onTouchStart}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={endDrag}
        onMouseLeave={endDrag}
        onKeyDown={onKeyDown}
        tabIndex={0}
        role="region"
        aria-label={`${title} media, swipe to browse`}
        className={`no-scrollbar media-track flex w-full snap-x snap-mandatory overflow-x-auto rounded-control border border-ink-hairline bg-paper-tinted shadow-float ${
          dragging ? "cursor-grabbing select-none" : "cursor-grab"
        }`}
      >
        {media.map((item, index) => (
          <div
            key={item.id}
            className="media-slide relative aspect-[4/5] w-full shrink-0 snap-center"
          >
            {item.kind === "video" ? (
              <video
                className="pointer-events-none absolute inset-0 h-full w-full object-cover"
                src={item.url}
                muted
                loop
                playsInline
                preload="metadata"
                poster={images[0]?.url}
                data-testid="product-video"
              />
            ) : (
              <Image
                src={item.url}
                alt={`${title} — media ${index + 1}`}
                fill
                priority={index === 0}
                sizes="(max-width: 640px) 100vw, (max-width: 1024px) 58vw, 720px"
                className="pointer-events-none object-cover"
                draggable={false}
              />
            )}
            <span className="pointer-events-none absolute bottom-3 left-3 rounded-full bg-ink/70 px-3 py-1 text-xs font-medium text-paper backdrop-blur-sm">
              {item.kind === "video" ? "Product video" : `${index + 1} of ${media.length}`}
            </span>
          </div>
        ))}
      </div>

      {media.length > 1 && (
        <div className="no-scrollbar flex gap-3 overflow-x-auto pb-1 small:w-20 small:flex-col small:overflow-y-auto small:pb-0">
          {media.map((item, index) => (
            <button
              key={item.id}
              type="button"
              onClick={() => goToIndex(index)}
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
      )}
    </div>
  )
}

export default ImageGallery

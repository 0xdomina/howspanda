"use client"

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react"

type AutoCarouselProps = {
  slides: ReactNode[]
  cardClassName?: string
  wrapperClassName?: string
  interval?: number
  ariaLabel?: string
}

const Arrow = ({ direction }: { direction: "left" | "right" }) => (
  <svg
    width="18"
    height="18"
    viewBox="0 0 16 16"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden="true"
    className={direction === "left" ? "rotate-90" : "-rotate-90"}
  >
    <path
      d="M4 6L8 10L12 6"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
)

const AutoCarousel = ({
  slides,
  cardClassName = "w-[78%] small:w-[44%] medium:w-[23%]",
  wrapperClassName = "gap-5",
  interval = 4000,
  ariaLabel = "Auto rotating product carousel",
}: AutoCarouselProps) => {
  const trackRef = useRef<HTMLDivElement>(null)
  const indexRef = useRef(0)
  const [index, setIndex] = useState(0)
  const [paused, setPaused] = useState(false)
  const total = slides.length

  const goTo = useCallback((target: number) => {
    const track = trackRef.current
    if (!track || total === 0) return
    const clamped =
      ((target % total) + total) % total
    const child = track.children[clamped] as HTMLElement | undefined
    if (!child) return
    indexRef.current = clamped
    setIndex(clamped)
    track.scrollTo({ left: child.offsetLeft, behavior: "smooth" })
  }, [total])

  useEffect(() => {
    indexRef.current = index
  }, [index])

  useEffect(() => {
    if (paused || total <= 1 || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return
    const id = window.setInterval(() => {
      goTo(indexRef.current + 1)
    }, interval)
    return () => window.clearInterval(id)
  }, [paused, total, interval, goTo])

  const handleScroll = useCallback(() => {
    const track = trackRef.current
    if (!track || track.children.length === 0) return
    const first = track.children[0] as HTMLElement
    const step = first.offsetWidth + 20
    const current = Math.round(track.scrollLeft / step)
    indexRef.current = current
    setIndex(current)
  }, [])

  return (
    <div
      className="relative"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={() => setPaused(false)}
      onTouchStart={() => setPaused(true)}
      onTouchEnd={() => setPaused(false)}
    >
      <div
        ref={trackRef}
        onScroll={handleScroll}
        aria-label={ariaLabel}
        className={`no-scrollbar flex snap-x snap-mandatory overflow-x-auto scroll-smooth pb-2 ${wrapperClassName}`}
      >
        {slides.map((slide, i) => (
          <div
            key={i}
            className={`${cardClassName} shrink-0 snap-start`}
          >
            {slide}
          </div>
        ))}
      </div>

      <div className="mt-5 flex items-center justify-center gap-5">
        <button
          type="button"
          aria-label="Previous product"
          onClick={() => goTo(indexRef.current - 1)}
          className="grid h-9 w-9 place-items-center rounded-full border border-ink-hairline bg-paper-surface text-ink transition-colors duration-fast hover:bg-brand hover:text-white"
        >
          <Arrow direction="left" />
        </button>

        <div className="flex items-center gap-2" role="tablist" aria-label="Carousel position">
          {total <= 9 &&
            Array.from({ length: total }).map((_, i) => (
              <button
                key={i}
                type="button"
                role="tab"
                aria-selected={i === index}
                aria-label={`Go to slide ${i + 1}`}
                onClick={() => goTo(i)}
                className={`h-2 rounded-full transition-all duration-fast ${
                  i === index ? "w-6 bg-brand" : "w-2 bg-ink/20 hover:bg-ink/40"
                }`}
              />
            ))}
        </div>

        <button
          type="button"
          aria-label="Next product"
          onClick={() => goTo(indexRef.current + 1)}
          className="grid h-9 w-9 place-items-center rounded-full border border-ink-hairline bg-paper-surface text-ink transition-colors duration-fast hover:bg-brand hover:text-white"
        >
          <Arrow direction="right" />
        </button>
      </div>
    </div>
  )
}

export default AutoCarousel

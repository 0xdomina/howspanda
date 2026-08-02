"use client"

import { clx } from "@medusajs/ui"

type RatingStarsProps = {
  value: number
  max?: number
  size?: "sm" | "md"
  showValue?: boolean
  className?: string
}

const STAR_PATH =
  "M12 2l2.94 6.02 6.64.9-4.85 4.66 1.19 6.52L12 17.28l-5.92 3.22 1.19-6.52L2.42 8.92l6.64-.9L12 2z"

const RatingStars = ({
  value,
  max = 5,
  size = "sm",
  showValue = false,
  className,
}: RatingStarsProps) => {
  const clamped = Math.max(0, Math.min(max, value))
  const rounded = Math.round(clamped * 2) / 2

  const renderStar = (i: number) => {
    const pos = i + 1
    let fill = 0
    if (rounded >= pos) fill = 1
    else if (rounded === pos - 0.5) fill = 0.5

    return (
      <span
        key={i}
        className="relative inline-flex"
        aria-hidden="true"
      >
        <svg
          width={size === "sm" ? 14 : 18}
          height={size === "sm" ? 14 : 18}
          viewBox="0 0 24 24"
          className="text-ink-hairline"
        >
          <path d={STAR_PATH} fill="currentColor" />
        </svg>
        <span
          className="absolute inset-0 overflow-hidden"
          style={{ width: `${fill * 100}%` }}
        >
          <svg
            width={size === "sm" ? 14 : 18}
            height={size === "sm" ? 14 : 18}
            viewBox="0 0 24 24"
            className="text-semantic-warning"
          >
            <path d={STAR_PATH} fill="currentColor" />
          </svg>
        </span>
      </span>
    )
  }

  return (
    <span
      className={clx("inline-flex items-center gap-0.5", className)}
      role="img"
      aria-label={`Rated ${value} out of ${max}`}
    >
      {Array.from({ length: max }, (_, i) => renderStar(i))}
      {showValue && (
        <span className="money ml-1 text-sm text-ink-muted">
          {value.toFixed(1)}
        </span>
      )}
    </span>
  )
}

export default RatingStars

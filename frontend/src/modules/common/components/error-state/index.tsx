"use client"

import { clx } from "@medusajs/ui"
import React from "react"

type ErrorStateProps = {
  title?: string
  description?: string
  onRetry?: () => void
  retryLabel?: string
  className?: string
}

/**
 * Error states always offer a recovery action, never a dead end.
 */
const ErrorState = ({
  title = "Something went wrong",
  description = "Try again in a moment.",
  onRetry,
  retryLabel = "Try again",
  className,
}: ErrorStateProps) => {
  return (
    <div
      className={clx(
        "flex w-full flex-col items-center gap-3 rounded-card border border-ink-hairline bg-paper-surface px-6 py-12 text-center",
        className
      )}
      role="alert"
    >
      <h3 className="font-display text-xl font-medium tracking-tight text-ink">
        {title}
      </h3>
      {description && (
        <p className="max-w-sm text-sm leading-relaxed text-ink-muted">
          {description}
        </p>
      )}
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="mt-2 rounded-control bg-ink px-5 py-2 text-sm font-medium text-paper-surface transition-transform duration-fast hover:bg-ink/90 active:scale-[0.98]"
        >
          {retryLabel}
        </button>
      )}
    </div>
  )
}

export default ErrorState
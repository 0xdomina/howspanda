import { clx } from "@medusajs/ui"
import React from "react"

type EmptyStateProps = {
  title: string
  description?: string
  action?: React.ReactNode
  className?: string
}

/**
 * Empty states are tutorials, never "no items". Always offer the next step.
 */
const EmptyState = ({ title, description, action, className }: EmptyStateProps) => {
  return (
    <div
      className={clx(
        "flex w-full flex-col items-center gap-3 rounded-card border border-dashed border-ink-hairline px-6 py-12 text-center",
        className
      )}
    >
      <h3 className="font-display text-xl font-medium tracking-tight text-ink">
        {title}
      </h3>
      {description && (
        <p className="max-w-sm text-sm leading-relaxed text-ink-muted">
          {description}
        </p>
      )}
      {action && <div className="mt-2">{action}</div>}
    </div>
  )
}

export default EmptyState
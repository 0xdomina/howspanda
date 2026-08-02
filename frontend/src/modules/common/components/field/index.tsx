import { clx } from "@medusajs/ui"
import React from "react"

type FieldProps = {
  label: string
  htmlFor?: string
  required?: boolean
  hint?: string
  error?: string
  children: React.ReactNode
  className?: string
}

/**
 * Form field wrapper: label above, control, hint/error below.
 * Errors pair text with the danger tone and a warning glyph, never color alone.
 */
const Field = ({
  label,
  htmlFor,
  required,
  hint,
  error,
  children,
  className,
}: FieldProps) => {
  return (
    <div className={clx("flex flex-col gap-1.5", className)}>
      <label
        htmlFor={htmlFor}
        className="text-sm font-medium text-ink"
      >
        {label}
        {required && <span className="text-semantic-danger"> *</span>}
      </label>
      {children}
      {error ? (
        <p
          className="flex items-center gap-1.5 text-xs text-semantic-danger"
          role="alert"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path
              d="M12 8v5M12 16.5v.5"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
          {error}
        </p>
      ) : hint ? (
        <p className="text-xs text-ink-muted">{hint}</p>
      ) : null}
    </div>
  )
}

export default Field
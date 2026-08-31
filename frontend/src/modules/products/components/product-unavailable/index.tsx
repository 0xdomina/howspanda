"use client"

import LocalizedClientLink from "@modules/common/components/localized-client-link"
import { useRouter } from "next/navigation"
import { useEffect, useState } from "react"

const RETRY_WINDOW_MS = 60_000
const RETRY_INTERVAL_MS = 5_000

const ProductUnavailable = () => {
  const router = useRouter()
  const [expired, setExpired] = useState(false)

  useEffect(() => {
    const startedAt = Date.now()
    const retry = () => {
      if (Date.now() - startedAt >= RETRY_WINDOW_MS) {
        setExpired(true)
        return
      }

      router.refresh()
    }

    const timer = window.setInterval(retry, RETRY_INTERVAL_MS)
    return () => window.clearInterval(timer)
  }, [router])

  return (
    <section
      className="figma-container flex min-h-[460px] flex-col items-center justify-center gap-5 px-6 text-center"
      role="status"
      aria-live="polite"
    >
      <div className="glass-panel flex h-14 w-14 items-center justify-center rounded-full text-2xl text-brand">
        {expired ? "⌁" : "…"}
      </div>
      <div className="max-w-md space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight text-ink">
          {expired ? "Product unavailable" : "Loading this product"}
        </h1>
        <p className="text-sm leading-6 text-ink-muted">
          {expired
            ? "This product is no longer available. Browse the marketplace to find something similar."
            : "We are bringing the product details into view. This can take a moment after a quiet spell."}
        </p>
      </div>
      {expired && (
        <LocalizedClientLink href="/store" className="figma-button">
          Browse marketplace
        </LocalizedClientLink>
      )}
    </section>
  )
}

export default ProductUnavailable

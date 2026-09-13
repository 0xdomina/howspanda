"use client"

import { useRouter } from "next/navigation"
import { useState } from "react"

import Button from "@modules/common/components/button"

// The seller product list couldn't load (signed-out session mid-bridge or a
// napping backend). This is never the "no products yet" empty state —
// it resolves itself with a refresh once the backend answers.
export default function SellerRetryPanel({
  title = "Couldn't load your products",
  body = "The store couldn't be reached just now. Your listings are safe — try again in a moment.",
}: {
  title?: string
  body?: string
}) {
  const router = useRouter()
  const [refreshing, setRefreshing] = useState(false)

  return (
    <div
      className="border border-amber-200 bg-amber-50 rounded-large p-6 text-center"
      data-testid="seller-products-retry"
      role="alert"
    >
      <p className="font-medium text-ink">{title}</p>
      <p className="mt-1 text-sm text-ink-muted">{body}</p>
      <Button
        className="mt-4"
        disabled={refreshing}
        isLoading={refreshing}
        onClick={() => {
          setRefreshing(true)
          router.refresh()
          window.setTimeout(() => setRefreshing(false), 5000)
        }}
        data-testid="seller-products-retry-button"
      >
        Try again
      </Button>
    </div>
  )
}

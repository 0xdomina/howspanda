"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"

import { deleteSellerProduct } from "@lib/data/seller"

const DeleteProductButton = ({
  productId,
  productTitle,
}: {
  productId: string
  productTitle: string
}) => {
  const router = useRouter()
  const [confirming, setConfirming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const run = () => {
    setError(null)
    startTransition(async () => {
      const result = await deleteSellerProduct(productId)
      if (result) {
        setError(result)
        setConfirming(false)
        return
      }
      router.refresh()
    })
  }

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="text-sm text-rose-600 underline underline-offset-4 hover:text-rose-700"
        data-testid={`delete-product-${productId}`}
      >
        Delete
      </button>
    )
  }

  return (
    <span className="inline-flex items-center gap-2">
      <span className="text-xs text-ink-muted">Remove “{productTitle}”?</span>
      <button
        type="button"
        disabled={isPending}
        onClick={run}
        className="text-sm font-medium text-rose-600 underline underline-offset-4 hover:text-rose-700 disabled:opacity-50"
        data-testid={`confirm-delete-product-${productId}`}
      >
        {isPending ? "Removing…" : "Yes, remove"}
      </button>
      <button
        type="button"
        disabled={isPending}
        onClick={() => {
          setConfirming(false)
          setError(null)
        }}
        className="text-sm text-ink-muted underline underline-offset-4 hover:text-ink disabled:opacity-50"
      >
        Keep
      </button>
      {error && <span className="text-xs text-rose-600">{error}</span>}
    </span>
  )
}

export default DeleteProductButton

"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"

import { markOrderDelivered, confirmReturnReceived } from "@lib/data/seller"

const STATUS_LABEL: Record<string, string> = {
  pending: "In escrow",
  available: "Available",
  reserved: "Reserved",
  paid: "Paid out",
  reversed: "Reversed",
}

function escrowSummary(escrow: any): string {
  if (!escrow) return "No escrow line"
  if (escrow.held_at) {
    return "Return requested — awaiting your confirmation"
  }
  if (escrow.delivered_at && escrow.status === "pending") {
    return "Delivered — awaiting buyer confirmation"
  }
  if (escrow.status === "pending") {
    return "Awaiting dispatch — mark delivered to start the return window"
  }
  return STATUS_LABEL[escrow.status] ?? escrow.status
}

const OrderActions = ({ order }: { order: any }) => {
  const [isPending, startTransition] = useTransition()
  const [message, setMessage] = useState<string | null>(null)
  const router = useRouter()
  const escrow = order.escrow
  const canMarkDelivered =
    escrow?.status === "pending" && !escrow.delivered_at && !escrow.held_at
  const canConfirmReturn =
    escrow?.status === "pending" && escrow.held_at && !escrow.delivered_at

  const run = (action: () => Promise<string | null>, successText: string) => {
    setMessage(null)
    startTransition(async () => {
      const error = await action()
      if (error) {
        setMessage(error)
      } else {
        setMessage(successText)
        router.refresh()
      }
    })
  }

  return (
    <div className="text-right">
      <p className="text-ink font-mono tabular-nums">
        {new Intl.NumberFormat("en-NG", {
          style: "currency",
          currency: escrow?.currency_code?.toUpperCase() ?? "NGN",
        }).format(Number(escrow?.net_amount ?? order.total ?? 0))}
      </p>
      <p className="mt-1 text-xs text-ink-muted">{escrowSummary(escrow)}</p>
      {message && (
        <p className="mt-2 text-xs text-rose-600">{message}</p>
      )}
      {canMarkDelivered && (
        <button
          type="button"
          disabled={isPending}
          onClick={() => run(() => markOrderDelivered(order.id), "Marked as delivered.")}
          className="mt-2 rounded-medium border border-ink-strong px-3 py-1.5 text-sm font-medium text-ink hover:bg-ink hover:text-white disabled:opacity-50"
        >
          {isPending ? "Marking…" : "Mark delivered"}
        </button>
      )}
      {canConfirmReturn && (
        <button
          type="button"
          disabled={isPending}
          onClick={() => run(() => confirmReturnReceived(order.id), "Return confirmed.")}
          className="mt-2 rounded-medium border border-ink-strong px-3 py-1.5 text-sm font-medium text-ink hover:bg-ink hover:text-white disabled:opacity-50"
        >
          {isPending ? "Confirming…" : "Return received"}
        </button>
      )}
    </div>
  )
}

export default OrderActions

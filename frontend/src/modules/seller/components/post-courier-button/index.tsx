"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"

import {
  listSellerDeliveryJobs,
  postDeliveryJob,
} from "@lib/data/delivery"

// One-click courier posting from a seller order: package + destination come
// from the order, pickup from store settings, price open to offers (0).
// Skips when a job already exists for the order.
const PostCourierButton = ({
  order,
  pickupAddress,
}: {
  order: any
  pickupAddress?: string | null
}) => {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [message, setMessage] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  const run = () => {
    setMessage(null)
    startTransition(async () => {
      const ship = order?.shipping_address
      const destination = [ship?.address_1, ship?.city].filter(Boolean).join(", ")
      if (!pickupAddress) {
        setMessage("Set your pickup address in Store settings first.")
        return
      }
      if (!destination) {
        setMessage("This order has no delivery address on file.")
        return
      }
      const jobs = await listSellerDeliveryJobs()
      if ((jobs ?? []).some((j: any) => j?.order_id === order.id && ["open", "negotiating", "accepted", "in_transit"].includes(j?.status))) {
        setMessage("A courier job already exists for this order.")
        setDone(true)
        return
      }
      const titles = (order?.items ?? []).map(
        (i: any) => `${Number(i.quantity) > 1 ? `${i.quantity}x ` : ""}${i.title ?? "item"}`
      )
      const res = await postDeliveryJob({
        orderId: order.id,
        packageDescription: titles.length ? titles.join(", ") : "Order items",
        pickupAddress,
        destinationAddress: destination,
        destinationPhone: ship?.phone ?? undefined,
        postedPrice: 0,
      })
      if (!res.success) {
        setMessage(res.error ?? "Could not post the job.")
        return
      }
      setDone(true)
      setMessage("Posted to the courier board — couriers can now bid.")
      router.refresh()
    })
  }

  if (done) return null

  return (
    <div className="mt-2 text-right">
      <button
        type="button"
        disabled={isPending}
        onClick={run}
        className="rounded-medium border border-ink-strong px-3 py-1.5 text-sm font-medium text-ink hover:bg-ink hover:text-white disabled:opacity-50"
      >
        {isPending ? "Posting…" : "Post courier job"}
      </button>
      {message && <p className="mt-2 text-xs text-ink-muted">{message}</p>}
    </div>
  )
}

export default PostCourierButton

"use client"

import { useState, useTransition } from "react"
import {
  getNotifications,
  markNotificationRead,
  claimBroadcast,
  type AppNotification,
} from "@lib/data/follows"
import LocalizedClientLink from "@modules/common/components/localized-client-link"

const TYPE_LABEL: Record<string, string> = {
  general: "Update",
  product: "New product",
  offer: "Offer",
  voucher: "Voucher",
  giveaway: "Giveaway",
  tip_received: "Thank-you",
  product_request_update: "Request update",
}

const NotificationsClient = ({
  notifications: initial,
  unreadCount,
}: {
  notifications: AppNotification[]
  unreadCount: number
}) => {
  const [items, setItems] = useState(initial)
  const [isPending, startTransition] = useTransition()

  const open = (n: AppNotification) => {
    if (!n.read_at) {
      startTransition(async () => {
        await markNotificationRead(n.id)
        setItems((prev) =>
          prev.map((x) => (x.id === n.id ? { ...x, read_at: new Date().toISOString() } : x))
        )
      })
    }
  }

  const claim = (n: AppNotification) => {
    if (!n.broadcast_id) return
    startTransition(async () => {
      const res = await claimBroadcast(n.broadcast_id!)
      if (res.success) {
        setItems((prev) =>
          prev.map((x) =>
            x.id === n.id
              ? {
                  ...x,
                  body: res.already
                    ? "You already claimed this giveaway."
                    : "You claimed this giveaway.",
                }
              : x
          )
        )
      } else {
        setItems((prev) =>
          prev.map((x) => (x.id === n.id ? { ...x, body: res.error ?? x.body } : x))
        )
      }
    })
  }

  return (
    <div className="space-y-6">
      <h2 className="font-display text-2xl font-medium tracking-[-0.02em] text-ink">
        Notifications
      </h2>
      {unreadCount > 0 && (
        <p className="text-sm text-ink-muted">
          {unreadCount} unread notification{unreadCount === 1 ? "" : "s"}
        </p>
      )}
      {items.length === 0 ? (
        <p className="text-sm text-ink-muted">
          No notifications yet. Follow stores to get their updates here.
        </p>
      ) : (
        <ul className="space-y-3">
          {items.map((n) => (
            <li
              key={n.id}
              className={`rounded-medium border border-ink-hairline bg-paper-surface p-4 ${
                !n.read_at ? "border-ink-strong" : ""
              }`}
            >
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-ink">
                    {n.actor_label ?? "Store"}{" "}
                    <span className="text-xs font-normal text-ink-muted">
                      · {TYPE_LABEL[n.payload?.type ?? n.kind] ?? n.kind}
                    </span>
                  </p>
                  <p className="mt-0.5 text-sm text-ink">{n.title}</p>
                  <p className="mt-1 text-sm text-ink-muted">{n.body}</p>
                  {n.payload?.voucher_code && (
                    <p className="mt-2 inline-block rounded-medium bg-ink/5 px-2 py-1 font-mono text-sm text-ink">
                      {n.payload.voucher_code}
                    </p>
                  )}
                  {n.kind === "tip_received" && n.payload?.redeemable_code && (
                    <p className="mt-2 inline-block rounded-medium bg-ink/5 px-2 py-1 font-mono text-sm text-ink">{n.payload.redeemable_code}</p>
                  )}
                </div>
                {n.actor_handle && (
                  <LocalizedClientLink
                    href={`/store/${n.actor_handle}`}
                    className="shrink-0 text-xs text-ink-muted underline"
                  >
                    View store
                  </LocalizedClientLink>
                )}
              </div>
              <div className="mt-2 flex items-center justify-between gap-3">
                <p className="text-xs text-ink-muted">
                  {n.created_at ? new Date(n.created_at).toLocaleString() : ""}
                </p>
                <div className="flex gap-2">
                  {n.kind === "product_request_update" && n.payload?.status === "available" && (
                    <LocalizedClientLink href="/account/requests" className="rounded-medium bg-ink px-3 py-1 text-xs font-medium text-white">View request</LocalizedClientLink>
                  )}
                  {n.payload?.type === "giveaway" && n.broadcast_id && (
                    <button
                      type="button"
                      disabled={isPending}
                      onClick={() => claim(n)}
                      className="rounded-medium bg-ink px-3 py-1 text-xs font-medium text-white hover:bg-ink/90 disabled:opacity-50"
                    >
                      Claim
                    </button>
                  )}
                  {!n.read_at && (
                    <button
                      type="button"
                      disabled={isPending}
                      onClick={() => open(n)}
                      className="rounded-medium border border-ink-strong px-3 py-1 text-xs font-medium text-ink hover:bg-ink hover:text-white disabled:opacity-50"
                    >
                      Mark read
                    </button>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export default NotificationsClient

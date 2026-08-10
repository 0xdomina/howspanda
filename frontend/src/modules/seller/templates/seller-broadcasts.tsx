"use client"

import { useState, useTransition } from "react"

import ShareButton from "@modules/common/components/share-button"
import { useShareUrl } from "@lib/hooks/use-share-url"
import {
  createSellerBroadcast,
  type SellerBroadcast,
} from "@lib/data/follows"

const TYPE_LABEL: Record<string, string> = {
  general: "General update",
  product: "New product",
  offer: "Special offer",
  voucher: "Voucher for followers",
  giveaway: "Giveaway",
}

const BroadcastComposer = ({
  remaining,
  followerCount,
  allowVoucher,
  onDone,
}: {
  remaining: number
  followerCount: number
  allowVoucher: boolean
  onDone: () => void
}) => {
  const [type, setType] = useState("general")
  const [title, setTitle] = useState("")
  const [body, setBody] = useState("")
  const [discountType, setDiscountType] = useState<"fixed" | "percent">("percent")
  const [discountValue, setDiscountValue] = useState("")
  const [expiresInDays, setExpiresInDays] = useState("")
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)
  const [isPending, startTransition] = useTransition()

  const canSend = remaining > 0

  const submit = () => {
    setMessage(null)
    if (!title.trim() || !body.trim()) {
      setMessage({ ok: false, text: "Title and message are required." })
      return
    }
    if (type === "voucher") {
      const value = Number(discountValue)
      if (!value || value <= 0 || (discountType === "percent" && value > 100)) {
        setMessage({
          ok: false,
          text:
            discountType === "percent"
              ? "Voucher discount must be between 1 and 100%."
              : "Enter a positive discount amount.",
        })
        return
      }
    }
    startTransition(async () => {
      const res = await createSellerBroadcast({
        type: type as "general" | "product" | "offer" | "voucher" | "giveaway",
        title: title.trim(),
        body: body.trim(),
        voucher:
          type === "voucher"
            ? {
                discount_type: discountType,
                discount_value: Number(discountValue),
                expires_in_days: expiresInDays ? Number(expiresInDays) : undefined,
              }
            : undefined,
      })
      if (res.success) {
        setMessage({
          ok: true,
          text: `Broadcast sent to ${followerCount.toLocaleString()} follower${
            followerCount === 1 ? "" : "s"
          }.`,
        })
        setTitle("")
        setBody("")
        setDiscountValue("")
        setExpiresInDays("")
        onDone()
      } else {
        setMessage({ ok: false, text: res.error ?? "Could not send broadcast." })
      }
    })
  }

  return (
    <div className="space-y-4 rounded-large border border-ink-hairline bg-paper-surface p-4">
      <div className="flex items-center justify-between">
        <h3 className="font-display text-lg font-medium text-ink">New broadcast</h3>
        <span
          className={`rounded-full px-2 py-0.5 text-xs font-medium ${
            canSend ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"
          }`}
        >
          {canSend
            ? `${remaining} of 3 this week`
            : "Weekly limit reached (3/week)"}
        </span>
      </div>

      <div>
        <label className="mb-1 block text-xs text-ink-muted">Type</label>
        <select
          value={type}
          onChange={(e) => setType(e.target.value)}
          className="w-full rounded-medium border border-ink-hairline px-3 py-2 text-sm text-ink outline-none focus:border-ink"
        >
          {Object.entries(TYPE_LABEL)
            .filter(([value]) => allowVoucher || value !== "voucher")
            .map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
            ))}
        </select>
      </div>

      <div>
        <label className="mb-1 block text-xs text-ink-muted">Title</label>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={80}
          placeholder="e.g. New tote bags just dropped"
          className="w-full rounded-medium border border-ink-hairline px-3 py-2 text-sm text-ink outline-none focus:border-ink"
        />
      </div>

      <div>
        <label className="mb-1 block text-xs text-ink-muted">Message</label>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          maxLength={2000}
          rows={4}
          placeholder="What should your followers know? Email addresses and phone numbers are not allowed — keep contact on-platform."
          className="w-full rounded-medium border border-ink-hairline px-3 py-2 text-sm text-ink outline-none focus:border-ink"
        />
      </div>

      {type === "voucher" && (
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-xs text-ink-muted">Discount</label>
            <select
              value={discountType}
              onChange={(e) => setDiscountType(e.target.value as "fixed" | "percent")}
              className="w-full rounded-medium border border-ink-hairline px-3 py-2 text-sm text-ink outline-none focus:border-ink"
            >
              <option value="percent">Percent</option>
              <option value="fixed">Fixed amount (NGN)</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs text-ink-muted">
              {discountType === "percent" ? "Percent off" : "Amount off (NGN)"}
            </label>
            <input
              value={discountValue}
              onChange={(e) => setDiscountValue(e.target.value.replace(/[^\d.]/g, ""))}
              placeholder={discountType === "percent" ? "e.g. 10" : "e.g. 5000"}
              inputMode="decimal"
              className="w-full rounded-medium border border-ink-hairline px-3 py-2 text-sm text-ink outline-none focus:border-ink"
            />
          </div>
        </div>
      )}

      {type === "voucher" && (
        <div>
          <label className="mb-1 block text-xs text-ink-muted">
            Expires in (days, optional)
          </label>
          <input
            value={expiresInDays}
            onChange={(e) => setExpiresInDays(e.target.value.replace(/[^\d]/g, ""))}
            placeholder="e.g. 30"
            inputMode="numeric"
            className="w-full rounded-medium border border-ink-hairline px-3 py-2 text-sm text-ink outline-none focus:border-ink"
          />
        </div>
      )}

      {message && (
        <p className={`text-sm ${message.ok ? "text-emerald-700" : "text-rose-600"}`}>
          {message.text}
        </p>
      )}

      <button
        type="button"
        disabled={!canSend || isPending}
        onClick={submit}
        className="w-full rounded-medium bg-ink px-3 py-2 text-sm font-medium text-white hover:bg-ink/90 disabled:opacity-50"
      >
        {isPending
          ? "Sending…"
          : canSend
            ? "Send broadcast"
            : "Weekly limit reached"}
      </button>

      <p className="text-xs text-ink-muted">
        Broadcasts go to your followers in-app only. Followers are private — you
        never see who they are, and they never see your contact details.
      </p>
    </div>
  )
}

const BroadcastList = ({
  broadcasts,
  sellerHandle,
}: {
  broadcasts: SellerBroadcast[]
  sellerHandle: string | null
}) => {
  const shareUrl = useShareUrl()
  if (broadcasts.length === 0) {
    return <p className="text-sm text-ink-muted">No broadcasts yet.</p>
  }
  return (
    <ul className="divide-y divide-ink-hairline">
      {broadcasts.map((b) => (
        <li key={b.id} className="py-3">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-medium text-ink">{b.title}</p>
            <div className="flex shrink-0 items-center gap-2">
              <span className="shrink-0 rounded-full bg-ink/5 px-2 py-0.5 text-xs text-ink">
                {TYPE_LABEL[b.type] ?? b.type}
              </span>
              {sellerHandle && (
                <ShareButton
                  entity="broadcast"
                  entityId={b.id}
                  className="flex h-8 w-8 items-center justify-center rounded-full border border-ink-hairline text-ink transition-colors duration-fast hover:bg-paper-tinted hover:text-ink active:scale-[0.96]"
                  payload={{
                    url: shareUrl(`/store/${sellerHandle}`),
                    text: `${b.title} — ${b.body}`,
                    title: b.title,
                  }}
                />
              )}
            </div>
          </div>
          <p className="mt-1 text-sm text-ink-muted">{b.body}</p>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-muted">
            <span>
              {b.created_at ? new Date(b.created_at).toLocaleDateString() : ""}
            </span>
            <span>{b.delivered ?? 0} delivered</span>
            <span>{b.read_count ?? 0} read</span>
            {b.type === "giveaway" && (
              <span>{b.giveaway_claims_count ?? 0} claims</span>
            )}
            {b.voucher_code && (
              <span className="font-mono text-ink">{b.voucher_code}</span>
            )}
          </div>
        </li>
      ))}
    </ul>
  )
}

const SellerBroadcastsClient = ({
  broadcasts: initial,
  remaining,
  followerCount,
  allowVoucher,
  sellerHandle,
}: {
  broadcasts: SellerBroadcast[]
  remaining: number
  followerCount: number
  allowVoucher: boolean
  sellerHandle: string | null
}) => {
  const [items, setItems] = useState(initial)
  const [left, setLeft] = useState(remaining)

  const reload = () => {
    // The list is server-rendered; refresh via a client-side re-fetch on next
    // visit. Optimistically append the just-sent broadcast isn't reliable for
    // stats, so we bump the remaining counter locally.
    setLeft((l) => Math.max(0, l - 1))
  }

  return (
    <div className="space-y-6">
      <h2 className="font-display text-2xl font-medium tracking-[-0.02em] text-ink">
        Broadcasts
      </h2>
      <p className="text-sm text-ink-muted">
        <strong>{followerCount.toLocaleString()}</strong> people follow your store.
        Followers only see your posts here, in-app.
      </p>

      <BroadcastComposer
        remaining={left}
        followerCount={followerCount}
        allowVoucher={allowVoucher}
        onDone={reload}
      />

      <div className="rounded-large border border-ink-hairline bg-paper-surface p-4">
        <h3 className="font-display text-lg font-medium text-ink">History</h3>
        <div className="mt-2">
          <BroadcastList broadcasts={items} sellerHandle={sellerHandle} />
        </div>
      </div>
    </div>
  )
}

export default SellerBroadcastsClient

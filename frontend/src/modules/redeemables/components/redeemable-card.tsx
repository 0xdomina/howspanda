"use client"

import { useState } from "react"

const gradients: Record<string, string> = {
  sunset: "linear-gradient(135deg,#ef4444 0%,#f59e0b 100%)",
  midnight: "linear-gradient(135deg,#111827 0%,#4338ca 100%)",
  mint: "linear-gradient(135deg,#047857 0%,#a7f3d0 100%)",
  candy: "linear-gradient(135deg,#db2777 0%,#c084fc 100%)",
  cobalt: "linear-gradient(135deg,#2563eb 0%,#22d3ee 100%)",
}

const typeLabel = (type: string) =>
  type === "gift_card" ? "Gift card" : type === "voucher" ? "Voucher" : "Ticket"

const money = (amount: number | string | null | undefined) =>
  new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(Number(amount ?? 0))

const dateLabel = (value?: string | null) =>
  value
    ? new Intl.DateTimeFormat("en-NG", {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(new Date(value))
    : null

export type RedeemableCardProps = {
  type: "gift_card" | "voucher" | "ticket" | string
  title?: string | null
  message?: string | null
  design?: string | null
  image?: string | null
  accentColor?: string | null
  faceValue?: number | string | null
  balance?: number | string | null
  discountType?: string | null
  discountValue?: number | string | null
  price?: number | string | null
  code?: string | null
  storeName?: string | null
  storeLogo?: string | null
  recipientEmail?: string | null
  eventName?: string | null
  venueName?: string | null
  venueAddress?: string | null
  eventStartsAt?: string | null
  eventEndsAt?: string | null
  expiresAt?: string | null
  mode?: "preview" | "owned" | "listing"
}

export default function RedeemableCard({
  type,
  title,
  message,
  design,
  image,
  accentColor,
  faceValue,
  balance,
  discountType,
  discountValue,
  price,
  code,
  storeName,
  storeLogo,
  recipientEmail,
  eventName,
  venueName,
  venueAddress,
  eventStartsAt,
  eventEndsAt,
  expiresAt,
  mode = "preview",
}: RedeemableCardProps) {
  const [copied, setCopied] = useState(false)
  const isTicket = type === "ticket"
  const value =
    type === "voucher"
      ? discountValue
        ? `${discountType === "percent" ? `${discountValue}% off` : `${money(discountValue)} off`}`
        : "Your offer"
      : balance != null && mode === "owned"
        ? `${money(balance)} left`
        : faceValue != null
          ? `${money(faceValue)} value`
          : "Your gift"
  const listingPrice = mode === "listing" && price != null ? money(price) : null
  const eventDate = dateLabel(eventStartsAt)
  const eventEnd = dateLabel(eventEndsAt)

  const copyCode = async () => {
    if (!code) return
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1600)
    } catch {
      setCopied(false)
    }
  }

  return (
    <article
      className="group relative isolate overflow-hidden rounded-[28px] text-white shadow-[0_20px_60px_-28px_rgba(15,23,42,.65)] transition-transform duration-200 hover:-translate-y-1 motion-reduce:transition-none"
      style={{
        background: gradients[design ?? ""] ?? gradients.sunset,
        border: accentColor ? `1px solid ${accentColor}99` : undefined,
      }}
      aria-label={`${typeLabel(type)}${title ? `: ${title}` : ""}`}
    >
      {image && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={image} alt="" loading="lazy" decoding="async" className="absolute inset-0 h-full w-full object-cover opacity-35 mix-blend-screen" />
      )}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_88%_8%,rgba(255,255,255,.38),transparent_32%),linear-gradient(120deg,rgba(255,255,255,.16),transparent_45%,rgba(0,0,0,.18))]" />
      <div className="relative p-5 small:p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex min-w-0 items-center gap-2">
            {storeLogo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={storeLogo} alt="" loading="lazy" decoding="async" className="h-7 w-7 rounded-full border border-white/50 object-cover" />
            ) : (
              <span className="flex h-7 w-7 items-center justify-center rounded-full border border-white/40 bg-white/15 text-xs font-semibold">
                {(storeName ?? "H").slice(0, 1).toUpperCase()}
              </span>
            )}
            <span className="truncate text-xs font-semibold tracking-wide text-white/85">
              {storeName ?? "How's U"}
            </span>
          </div>
          <span className="shrink-0 text-xs font-semibold uppercase tracking-[0.18em] text-white/75">
            {typeLabel(type)}
          </span>
        </div>

        <div className="mt-9 min-h-[96px]">
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-white/65">
            {isTicket ? "Your entry pass" : "Made to keep"}
          </p>
          <h3 className="mt-2 line-clamp-2 font-display text-2xl font-medium leading-tight">
            {title || (isTicket ? eventName : undefined) || "A little something for you"}
          </h3>
          {message && <p className="mt-2 line-clamp-2 max-w-[32rem] text-sm leading-5 text-white/80">{message}</p>}
        </div>

        {isTicket && (eventDate || venueName || venueAddress) && (
          <div className="mt-4 grid gap-2 rounded-2xl border border-white/20 bg-black/10 p-3 text-xs text-white/85 backdrop-blur-sm small:grid-cols-2">
            {(eventDate || eventEnd) && <div><span className="block text-[10px] uppercase tracking-[0.16em] text-white/55">When</span><span className="mt-1 block">{eventDate ?? "Date to be confirmed"}{eventEnd ? ` – ${eventEnd}` : ""}</span></div>}
            {(venueName || venueAddress) && <div><span className="block text-[10px] uppercase tracking-[0.16em] text-white/55">Where</span><span className="mt-1 block">{venueName ?? venueAddress}{venueName && venueAddress ? ` · ${venueAddress}` : ""}</span></div>}
          </div>
        )}

        <div className="mt-8 flex items-end justify-between gap-4">
          <div>
            <p className="text-xs text-white/65">{listingPrice ? `Buy for ${listingPrice}` : value}</p>
            {expiresAt && <p className="mt-1 text-[11px] text-white/65">Use by {new Date(expiresAt).toLocaleDateString("en-NG")}</p>}
          </div>
          {mode === "listing" ? (
            <span className="rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-ink">Available in store</span>
          ) : (
            <span className="text-2xl text-white/80" aria-hidden="true">✦</span>
          )}
        </div>
      </div>

      {mode === "owned" && code && (
        <div className="relative flex items-center justify-between gap-3 border-t border-white/25 bg-black/15 px-5 py-4 backdrop-blur-sm small:px-6">
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/55">Your code</p>
            <p className="mt-1 truncate font-mono text-sm font-semibold tracking-[0.12em] text-white">{code}</p>
          </div>
          <button type="button" onClick={copyCode} className="shrink-0 rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-ink transition-transform duration-150 active:scale-95">
            {copied ? "Copied" : "Copy code"}
          </button>
        </div>
      )}
    </article>
  )
}

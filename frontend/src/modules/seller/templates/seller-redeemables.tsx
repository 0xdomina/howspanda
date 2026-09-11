"use client"

import { ChangeEvent, useState, useTransition } from "react"

import {
  cancelSellerRedeemable,
  createSellerRedeemable,
  redeemInStore,
  type SellerRedeemable,
} from "@lib/data/seller"
import { encodeProductImage } from "@lib/media/image"
import { uploadSellerMedia } from "@lib/data/seller-media"
import RedeemableCard from "@modules/redeemables/components/redeemable-card"
import ShareButton from "@modules/common/components/share-button"
import { getBaseURL } from "@lib/util/env"
import {
  CARD_OCCASIONS,
  occasionDesignValue,
} from "@lib/card-occasions"
import { legacyGradientFor } from "@lib/store-skins"

const money = (amount: number | string | null | undefined) => {
  const value = Number(amount ?? 0)
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(Number.isFinite(value) ? value : 0)
}

const typeLabel = (type: string) => {
  if (type === "gift_card") return "Gift card"
  if (type === "voucher") return "Voucher"
  return "Ticket"
}

const CLASSIC_DESIGNS = ["sunset", "midnight", "mint", "candy", "cobalt"] as const
const CLASSIC_ACCENTS: Record<string, string> = {
  sunset: "#ef4444",
  midnight: "#4338ca",
  mint: "#047857",
  candy: "#db2777",
  cobalt: "#2563eb",
}

const RedeemInStore = () => {
  const [code, setCode] = useState("")
  const [amount, setAmount] = useState("")
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)
  const [isPending, startTransition] = useTransition()

  const submit = () => {
    setMessage(null)
    startTransition(async () => {
      const parsed = amount.trim() === "" ? undefined : Number(amount)
      const res = await redeemInStore(code.trim().toUpperCase(), parsed)
      if (res.success) {
        setCode("")
        setAmount("")
        setMessage({ ok: true, text: "Redeemed. The code is now consumed." })
      } else {
        setMessage({ ok: false, text: res.error ?? "Could not redeem." })
      }
    })
  }

  return (
    <div className="space-y-3">
      <div>
        <label className="mb-1 block text-xs text-ink-muted">Code</label>
        <input
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          placeholder="GC-XXXX-XXXX-XXXX"
          className="w-full rounded-medium border border-ink-hairline px-3 py-2 font-mono text-sm text-ink outline-none focus:border-ink"
        />
      </div>
      <div>
        <label className="mb-1 block text-xs text-ink-muted">
          Amount to draw down (gift cards only — leave blank for vouchers/tickets)
        </label>
        <input
          value={amount}
          onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ""))}
          placeholder="e.g. 5000"
          inputMode="decimal"
          className="w-full rounded-medium border border-ink-hairline px-3 py-2 text-sm text-ink outline-none focus:border-ink"
        />
      </div>
      {message && (
        <p className={`text-sm ${message.ok ? "text-emerald-700" : "text-rose-600"}`}>
          {message.text}
        </p>
      )}
      <button
        type="button"
        disabled={isPending}
        onClick={submit}
        className="w-full rounded-medium bg-ink px-3 py-2 text-sm font-medium text-white hover:bg-ink/90 disabled:opacity-50"
      >
        {isPending ? "Redeeming…" : "Redeem in store"}
      </button>
    </div>
  )
}

const CreateForm = ({ onCreated }: { onCreated: (code: string) => void }) => {
  const [type, setType] = useState<"gift_card" | "voucher" | "ticket">("gift_card")
  const [title, setTitle] = useState("")
  const [price, setPrice] = useState("")
  const [faceValue, setFaceValue] = useState("")
  const [discountType, setDiscountType] = useState<"fixed" | "percent">("fixed")
  const [discountValue, setDiscountValue] = useState("")
  const [quantity, setQuantity] = useState("1")
  const [email, setEmail] = useState("")
  const [expires, setExpires] = useState("")
  const [design, setDesign] = useState<string>("occasion:birthday")
  const [backgroundImage, setBackgroundImage] = useState("")
  const [accentColor, setAccentColor] = useState("#f9a8d4")
  const [message, setMessage] = useState("")
  const [eventName, setEventName] = useState("")
  const [venueName, setVenueName] = useState("")
  const [venueAddress, setVenueAddress] = useState("")
  const [eventStartsAt, setEventStartsAt] = useState("")
  const [eventEndsAt, setEventEndsAt] = useState("")
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const uploadBackground = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    setUploading(true)
    try {
      const blob = await encodeProductImage(file)
      const result = await uploadSellerMedia(new File([blob], `redeemable-${Date.now()}.webp`, { type: blob.type }), "image")
      if (result.url) setBackgroundImage(result.url)
      else setError(result.error ?? "Could not upload that image.")
    } catch (error: any) {
      setError(error?.message ?? "Could not process that image.")
    } finally {
      setUploading(false)
      event.target.value = ""
    }
  }

  const submit = () => {
    setError(null)
    if (title.trim().length < 2) {
      setError("Give the code a title (min 2 characters).")
      return
    }
    const qty = Number(quantity)
    if (!Number.isInteger(qty) || qty < 1 || qty > 100) {
      setError("Quantity must be between 1 and 100.")
      return
    }
    if (type === "voucher") {
      const val = Number(discountValue)
      if (!(val > 0)) {
        setError("Vouchers need a discount value.")
        return
      }
      if (discountType === "percent" && val > 100) {
        setError("Percent vouchers must be between 1 and 100.")
        return
      }
    } else {
      const face = Number(faceValue)
      if (!(face > 0)) {
        setError(`${typeLabel(type)}s need a positive face value.`)
        return
      }
    }

    if (type === "ticket" && eventStartsAt && eventEndsAt && new Date(eventEndsAt) <= new Date(eventStartsAt)) {
      setError("The ticket end time must be after its start time.")
      return
    }

    startTransition(async () => {
      const res = await createSellerRedeemable({
        type,
        title: title.trim(),
        price: price.trim() ? Number(price) : undefined,
        design_variant: design,
        background_image: backgroundImage || undefined,
        accent_color: accentColor,
        message: message.trim() || undefined,
        event_name: type === "ticket" ? eventName.trim() || undefined : undefined,
        venue_name: type === "ticket" ? venueName.trim() || undefined : undefined,
        venue_address: type === "ticket" ? venueAddress.trim() || undefined : undefined,
        event_starts_at: type === "ticket" ? eventStartsAt || undefined : undefined,
        event_ends_at: type === "ticket" ? eventEndsAt || undefined : undefined,
        face_value: type === "voucher" ? undefined : Number(faceValue),
        discount_type: type === "voucher" ? discountType : undefined,
        discount_value: type === "voucher" ? Number(discountValue) : undefined,
        quantity: qty,
        issued_to_email: email.trim() || undefined,
        expires_at: expires || undefined,
      })
      if (res.success) {
        setTitle("")
        setPrice("")
        setFaceValue("")
        setDiscountValue("")
        setEmail("")
        setExpires("")
        setQuantity("1")
        setMessage("")
        setEventName("")
        setVenueName("")
        setVenueAddress("")
        setEventStartsAt("")
        setEventEndsAt("")
        setBackgroundImage("")
        onCreated(res.code ?? "")
      } else {
        setError(res.error)
      }
    })
  }

  return (
    <div className="grid gap-6 large:grid-cols-[minmax(0,1fr)_280px]">
      <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="mb-1 block text-xs text-ink-muted">Type</label>
          <select
            value={type}
            onChange={(e) => setType(e.target.value as "gift_card" | "voucher" | "ticket")}
            className="w-full rounded-medium border border-ink-hairline px-3 py-2 text-sm text-ink outline-none focus:border-ink"
          >
            <option value="gift_card">Gift card</option>
            <option value="voucher">Voucher</option>
            <option value="ticket">Ticket</option>
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs text-ink-muted">Quantity</label>
          <input
            value={quantity}
            onChange={(e) => setQuantity(e.target.value.replace(/\D/g, "").slice(0, 3))}
            inputMode="numeric"
            className="w-full rounded-medium border border-ink-hairline px-3 py-2 text-sm text-ink outline-none focus:border-ink"
          />
        </div>
      </div>
      <div>
        <label className="mb-1 block text-xs text-ink-muted">Title</label>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={type === "gift_card" ? "e.g. Birthday gift card" : type === "voucher" ? "e.g. 10% off everything" : "e.g. Saturday market entry"}
          className="w-full rounded-medium border border-ink-hairline px-3 py-2 text-sm text-ink outline-none focus:border-ink"
        />
      </div>
      <div>
        <label className="mb-1 block text-xs text-ink-muted">Sell for (optional)</label>
        <input value={price} onChange={(e) => setPrice(e.target.value.replace(/[^\d.]/g, ""))} placeholder="e.g. 5000" inputMode="decimal" className="w-full rounded-medium border border-ink-hairline px-3 py-2 text-sm text-ink outline-none focus:border-ink" />
        <p className="mt-1 text-xs text-ink-muted">Add a price to list it in your public store.</p>
      </div>
      {type === "voucher" ? (
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-xs text-ink-muted">Discount type</label>
            <select
              value={discountType}
              onChange={(e) => setDiscountType(e.target.value as "fixed" | "percent")}
              className="w-full rounded-medium border border-ink-hairline px-3 py-2 text-sm text-ink outline-none focus:border-ink"
            >
              <option value="fixed">Fixed amount</option>
              <option value="percent">Percent</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs text-ink-muted">
              {discountType === "fixed" ? "Amount (₦)" : "Percent"}
            </label>
            <input
              value={discountValue}
              onChange={(e) => setDiscountValue(e.target.value.replace(/[^\d.]/g, ""))}
              placeholder={discountType === "fixed" ? "e.g. 2000" : "e.g. 10"}
              inputMode="decimal"
              className="w-full rounded-medium border border-ink-hairline px-3 py-2 text-sm text-ink outline-none focus:border-ink"
            />
          </div>
        </div>
      ) : (
        <div>
          <label className="mb-1 block text-xs text-ink-muted">
            Face value (₦) {type === "ticket" ? "— door price" : "— loaded onto each card"}
          </label>
          <input
            value={faceValue}
            onChange={(e) => setFaceValue(e.target.value.replace(/[^\d.]/g, ""))}
            placeholder="e.g. 5000"
            inputMode="decimal"
            className="w-full rounded-medium border border-ink-hairline px-3 py-2 text-sm text-ink outline-none focus:border-ink"
          />
        </div>
      )}
      {type === "ticket" && (
        <div className="space-y-3 rounded-medium border border-ink-hairline bg-white/40 p-3">
          <div>
            <p className="text-sm font-medium text-ink">Make the pass useful at the door</p>
            <p className="mt-1 text-xs leading-5 text-ink-muted">Add the event, place, and time so the recipient can arrive with confidence.</p>
          </div>
          <input value={eventName} onChange={(e) => setEventName(e.target.value)} placeholder="Event or experience name" className="w-full rounded-medium border border-ink-hairline px-3 py-2 text-sm text-ink outline-none focus:border-ink" />
          <div className="grid gap-3 small:grid-cols-2">
            <input value={venueName} onChange={(e) => setVenueName(e.target.value)} placeholder="Venue or place" className="w-full rounded-medium border border-ink-hairline px-3 py-2 text-sm text-ink outline-none focus:border-ink" />
            <input value={venueAddress} onChange={(e) => setVenueAddress(e.target.value)} placeholder="Address (optional)" className="w-full rounded-medium border border-ink-hairline px-3 py-2 text-sm text-ink outline-none focus:border-ink" />
          </div>
          <div className="grid gap-3 small:grid-cols-2">
            <label className="text-xs text-ink-muted">Starts<input type="datetime-local" value={eventStartsAt} onChange={(e) => setEventStartsAt(e.target.value)} className="mt-1 w-full rounded-medium border border-ink-hairline px-3 py-2 text-sm text-ink outline-none focus:border-ink" /></label>
            <label className="text-xs text-ink-muted">Ends (optional)<input type="datetime-local" value={eventEndsAt} onChange={(e) => setEventEndsAt(e.target.value)} className="mt-1 w-full rounded-medium border border-ink-hairline px-3 py-2 text-sm text-ink outline-none focus:border-ink" /></label>
          </div>
        </div>
      )}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="mb-1 block text-xs text-ink-muted">Issue to email (optional)</label>
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="buyer@example.com"
            type="email"
            className="w-full rounded-medium border border-ink-hairline px-3 py-2 text-sm text-ink outline-none focus:border-ink"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs text-ink-muted">Expires (optional)</label>
          <input
            value={expires}
            onChange={(e) => setExpires(e.target.value)}
            type="date"
            className="w-full rounded-medium border border-ink-hairline px-3 py-2 text-sm text-ink outline-none focus:border-ink"
          />
        </div>
      </div>
      <div className="rounded-medium border border-ink-hairline bg-white/40 p-3">
        <p className="text-sm font-medium text-ink">Make it memorable</p>
        <p className="mt-1 text-xs text-ink-muted">Pick the occasion — illustrated artwork buyers recognise instantly.</p>
        <div className="mt-3 grid grid-cols-4 gap-2">
          {CARD_OCCASIONS.map((o) => {
            const value = occasionDesignValue(o.id)
            const active = design === value
            return (
              <button
                key={o.id}
                type="button"
                aria-label={`${o.label} occasion`}
                title={o.label}
                onClick={() => { setDesign(value); setAccentColor(o.accent) }}
                className={`group relative h-14 overflow-hidden rounded-small border-2 transition ${active ? "border-ink ring-2 ring-ink/10" : "border-transparent hover:border-ink/20"}`}
                style={{ background: o.art }}
              >
                <span className="absolute inset-x-0 bottom-0 bg-black/45 px-1 py-0.5 text-center text-[9px] font-semibold leading-tight text-white">
                  {o.label}
                </span>
                {active && <span className="absolute right-1 top-1 grid h-4 w-4 place-items-center rounded-full bg-white text-[10px] text-ink">✓</span>}
              </button>
            )
          })}
        </div>
        <p className="mt-3 text-xs text-ink-muted">Or a classic gradient</p>
        <div className="mt-2 grid grid-cols-5 gap-2">
          {CLASSIC_DESIGNS.map((item) => <button key={item} type="button" aria-label={`${item} design`} onClick={() => { setDesign(item); setAccentColor(CLASSIC_ACCENTS[item]) }} className={`h-8 rounded-small border-2 ${design === item ? "border-ink" : "border-transparent"}`} style={{ background: legacyGradientFor(item) }} />)}
        </div>
        <div className="mt-3 flex items-center gap-3"><label className="text-xs text-ink-muted">Highlight</label><input type="color" value={accentColor} onChange={(e) => setAccentColor(e.target.value)} className="h-8 w-10 cursor-pointer rounded border-0 bg-transparent" /></div>
        <label className="mt-3 flex cursor-pointer items-center justify-center rounded-medium border border-dashed border-ink-hairline px-3 py-2 text-xs font-medium text-ink hover:bg-white">{uploading ? "Preparing image…" : backgroundImage ? "Change artwork" : "Add artwork (optional)"}<input type="file" accept="image/*" className="sr-only" onChange={uploadBackground} disabled={uploading} /></label>
        {backgroundImage && <button type="button" onClick={() => setBackgroundImage("")} className="mt-2 text-xs text-rose-600 hover:underline">Remove artwork</button>}
        <textarea value={message} onChange={(e) => setMessage(e.target.value.slice(0, 180))} rows={2} maxLength={180} placeholder="A little note for the recipient" className="mt-3 w-full rounded-medium border border-ink-hairline px-3 py-2 text-sm text-ink outline-none focus:border-ink" />
      </div>
      {error && <p className="text-sm text-rose-600">{error}</p>}
      <button
        type="button"
        disabled={isPending || uploading}
        onClick={submit}
        className="w-full rounded-medium bg-ink px-3 py-2 text-sm font-medium text-white hover:bg-ink/90 disabled:opacity-50"
      >
        {isPending ? "Creating…" : `Create ${typeLabel(type).toLowerCase()}${quantity !== "1" ? "s" : ""}`}
      </button>
      </div>
      <div className="large:sticky large:top-6 large:self-start"><p className="mb-2 text-xs font-medium uppercase tracking-[0.16em] text-ink-muted">What buyers receive</p><RedeemableCard type={type} title={title} message={message} design={design} image={backgroundImage} accentColor={accentColor} faceValue={type === "voucher" ? undefined : faceValue} discountType={discountType} discountValue={type === "voucher" ? discountValue : undefined} eventName={eventName} venueName={venueName} venueAddress={venueAddress} eventStartsAt={eventStartsAt} eventEndsAt={eventEndsAt} mode="preview" /></div>
    </div>
  )
}

// Tap a row to see the card exactly as the buyer receives it, with a share
// action (native sheet, falls back to copy). Screenshotting the open card
// gives sellers a ready-made visual to post anywhere.
const RedeemableRow = ({
  item: r,
  isOwner,
  onCancel,
  cancelPending,
}: {
  item: SellerRedeemable
  isOwner: boolean
  onCancel: (id: string) => void
  cancelPending: boolean
}) => {
  const [open, setOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const shareText = `${typeLabel(r.type)} · ${r.title ?? ""} — code ${r.code}. Redeem it on How's U.`

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(r.code)
    } catch {
      const ta = document.createElement("textarea")
      ta.value = r.code
      document.body.appendChild(ta)
      ta.select()
      document.execCommand("copy")
      ta.remove()
    }
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1500)
  }

  return (
    <li className="py-3">
      <div className="flex items-center justify-between gap-4">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className="min-w-0 flex-1 text-left"
          data-testid={`redeemable-row-${r.id}`}
        >
          <p className="truncate text-sm font-medium text-ink">
            {typeLabel(r.type)} · {r.title}
            <span aria-hidden="true" className="ml-1 text-ink-muted">{open ? "▾" : "▸"}</span>
          </p>
          <p className="truncate text-xs text-ink-muted">
            <span className="font-mono">{r.code}</span>
            {r.type === "gift_card" && r.balance != null
              ? ` · ${money(r.balance)} left`
              : r.face_value != null
                ? ` · ${money(r.face_value)}`
                : r.discount_type === "percent"
                  ? ` · ${r.discount_value}% off`
                  : ` · ${money(r.discount_value)} off`}
            {r.issued_to_email ? ` · ${r.issued_to_email}` : ""}
            {r.expires_at
              ? ` · expires ${new Date(r.expires_at).toLocaleDateString()}`
              : ""}
          </p>
        </button>
        <div className="flex shrink-0 items-center gap-3">
          <span
            className={`rounded-full px-2 py-0.5 text-xs ${
              r.status === "active"
                ? "bg-emerald-600/10 text-emerald-700"
                : "bg-ink/10 text-ink"
            }`}
          >
            {r.status ?? "unknown"}
          </span>
          {isOwner && r.status === "active" && (
            <button
              type="button"
              disabled={cancelPending}
              onClick={() => onCancel(r.id)}
              className="text-xs text-rose-600 hover:underline disabled:opacity-50"
            >
              Cancel
            </button>
          )}
        </div>
      </div>
      {open && (
        <div className="mt-3 animate-[fadeIn_0.3s_ease]" data-testid={`redeemable-detail-${r.id}`}>
          <RedeemableCard
            type={r.type}
            title={r.title}
            message={r.message}
            design={r.design_variant}
            image={r.background_image}
            accentColor={r.accent_color}
            faceValue={r.face_value}
            balance={r.balance}
            discountType={r.discount_type}
            discountValue={r.discount_value}
            code={r.code}
            eventName={r.event_name}
            venueName={r.venue_name}
            venueAddress={r.venue_address}
            eventStartsAt={r.event_starts_at}
            eventEndsAt={r.event_ends_at}
            expiresAt={r.expires_at}
            mode="owned"
          />
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <ShareButton
              entity="redeemable"
              entityId={r.id}
              label={`Share ${r.title ?? "code"}`}
              payload={{
                url: `${getBaseURL()}/store`,
                text: shareText,
                title: `${r.title ?? "Gift"} — How's U`,
              }}
            />
            <button
              type="button"
              onClick={copyCode}
              className="rounded-control border border-ink-hairline px-3 py-2 text-xs font-medium text-ink transition hover:bg-ink hover:text-white active:scale-[0.98]"
            >
              {copied ? "Code copied ✓" : "Copy code"}
            </button>
            <span className="text-[11px] text-ink-muted">
              Screenshot the card above to post it anywhere.
            </span>
          </div>
        </div>
      )}
    </li>
  )
}

const RedeemablesClient = ({
  redeemables,
  isOwner,
}: {
  redeemables: SellerRedeemable[]
  isOwner: boolean
}) => {
  const [creating, setCreating] = useState(false)
  const [redeeming, setRedeeming] = useState(false)
  const [createdCode, setCreatedCode] = useState<string | null>(null)
  const [filterType, setFilterType] = useState("")
  const [isPending, startTransition] = useTransition()

  const cancel = (id: string) => {
    startTransition(async () => {
      await cancelSellerRedeemable(id)
      window.location.reload()
    })
  }

  const active = redeemables.filter((r) => r.status === "active")
  const filtered = filterType
    ? redeemables.filter((r) => r.type === filterType)
    : redeemables

  const counts = {
    gift_card: redeemables.filter((r) => r.type === "gift_card").length,
    voucher: redeemables.filter((r) => r.type === "voucher").length,
    ticket: redeemables.filter((r) => r.type === "ticket").length,
  }

  const buckets = [
    { label: "Active", value: active.length },
    { label: "Gift cards", value: counts.gift_card },
    { label: "Vouchers", value: counts.voucher },
    { label: "Tickets", value: counts.ticket },
  ]

  return (
    <div data-testid="seller-redeemables-page" className="space-y-6">
      <h2 className="font-display text-2xl font-medium tracking-[-0.02em] text-ink">
        Redeemables
      </h2>

      <div className="grid grid-cols-4 gap-4">
        {buckets.map((b) => (
          <div
            key={b.label}
            className="rounded-large border border-ink-hairline bg-paper-surface p-4"
          >
            <p className="text-xs text-ink-muted">{b.label}</p>
            <p className="mt-1 font-mono tabular-nums text-lg text-ink">{b.value}</p>
          </div>
        ))}
      </div>

      <div className="rounded-large border border-ink-hairline bg-paper-surface p-4">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-display text-lg font-medium text-ink">Create a code</h3>
          {isOwner && !creating && (
            <button
              type="button"
              onClick={() => setCreating(true)}
              className="rounded-medium border border-ink-strong px-3 py-1.5 text-sm font-medium text-ink hover:bg-ink hover:text-white"
            >
              New code
            </button>
          )}
        </div>
        {!isOwner && (
          <p className="text-sm text-ink-muted">
            Only the store owner can create or cancel redeemables. You can still
            open the till if redeemable access is enabled for your account.
          </p>
        )}
        {isOwner && createdCode && (
          <div className="mb-4 rounded-medium bg-ink/5 border border-ink-hairline p-3">
            <p className="text-xs text-ink-muted">Code(s) created — share this with your buyer:</p>
            <p className="mt-1 font-mono text-lg font-semibold text-ink">{createdCode}</p>
          </div>
        )}
        {isOwner && creating && (
          <CreateForm
            onCreated={(code) => {
              setCreating(false)
              setCreatedCode(code)
            }}
          />
        )}
      </div>

      <div className="rounded-large border border-ink-hairline bg-paper-surface p-4">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-display text-lg font-medium text-ink">Redeem in store</h3>
          {!redeeming && (
            <button
              type="button"
              onClick={() => setRedeeming(true)}
              className="rounded-medium border border-ink-strong px-3 py-1.5 text-sm font-medium text-ink hover:bg-ink hover:text-white"
            >
              Open till
            </button>
          )}
        </div>
        {redeeming && <RedeemInStore />}
      </div>

      <div className="rounded-large border border-ink-hairline bg-paper-surface p-4">
        <div className="mb-4 flex items-center justify-between gap-4">
          <h3 className="font-display text-lg font-medium text-ink">Codes</h3>
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            className="rounded-medium border border-ink-hairline px-3 py-1.5 text-sm text-ink outline-none focus:border-ink"
          >
            <option value="">All types</option>
            <option value="gift_card">Gift cards</option>
            <option value="voucher">Vouchers</option>
            <option value="ticket">Tickets</option>
          </select>
        </div>
        {filtered.length === 0 ? (
          <p className="text-sm text-ink-muted">No codes yet.</p>
        ) : (
          <ul className="divide-y divide-ink-hairline">
            {filtered.map((r) => (
              <RedeemableRow key={r.id} item={r} isOwner={isOwner} onCancel={cancel} cancelPending={isPending} />
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

export default RedeemablesClient

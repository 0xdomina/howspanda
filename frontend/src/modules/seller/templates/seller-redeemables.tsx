"use client"

import { useState, useTransition } from "react"

import {
  cancelSellerRedeemable,
  createSellerRedeemable,
  redeemInStore,
  type SellerRedeemable,
} from "@lib/data/seller"

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
  const [faceValue, setFaceValue] = useState("")
  const [discountType, setDiscountType] = useState<"fixed" | "percent">("fixed")
  const [discountValue, setDiscountValue] = useState("")
  const [quantity, setQuantity] = useState("1")
  const [email, setEmail] = useState("")
  const [expires, setExpires] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

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

    startTransition(async () => {
      const res = await createSellerRedeemable({
        type,
        title: title.trim(),
        face_value: type === "voucher" ? undefined : Number(faceValue),
        discount_type: type === "voucher" ? discountType : undefined,
        discount_value: type === "voucher" ? Number(discountValue) : undefined,
        quantity: qty,
        issued_to_email: email.trim() || undefined,
        expires_at: expires || undefined,
      })
      if (res.success) {
        setTitle("")
        setFaceValue("")
        setDiscountValue("")
        setEmail("")
        setExpires("")
        setQuantity("1")
        onCreated(res.code ?? "")
      } else {
        setError(res.error)
      }
    })
  }

  return (
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
      {error && <p className="text-sm text-rose-600">{error}</p>}
      <button
        type="button"
        disabled={isPending}
        onClick={submit}
        className="w-full rounded-medium bg-ink px-3 py-2 text-sm font-medium text-white hover:bg-ink/90 disabled:opacity-50"
      >
        {isPending ? "Creating…" : `Create ${typeLabel(type).toLowerCase()}${quantity !== "1" ? "s" : ""}`}
      </button>
    </div>
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
              <li key={r.id} className="flex items-center justify-between gap-4 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-ink">
                    {typeLabel(r.type)} · {r.title}
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
                </div>
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
                      disabled={isPending}
                      onClick={() => cancel(r.id)}
                      className="text-xs text-rose-600 hover:underline disabled:opacity-50"
                    >
                      Cancel
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

export default RedeemablesClient

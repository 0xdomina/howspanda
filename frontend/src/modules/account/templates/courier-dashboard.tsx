"use client"

import { useState, useTransition } from "react"
import LocalizedClientLink from "@modules/common/components/localized-client-link"
import { applyCourier, type CourierMe } from "@lib/data/delivery"
import { getDisplayName } from "@lib/util/name"

const ngn = (v: number | string | undefined) =>
  new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    maximumFractionDigits: 0,
  }).format(Number(v ?? 0))

const statusLabel: Record<string, string> = {
  open: "Open for offers",
  negotiating: "Negotiating",
  accepted: "Accepted",
  in_transit: "In transit",
  delivered: "Delivered",
  cancelled: "Cancelled",
}

const badge = (status: string) => {
  if (status === "approved") return "bg-emerald-50 text-emerald-700"
  if (status === "suspended") return "bg-rose-50 text-rose-700"
  return "bg-ink/10 text-ink"
}

const ApplyForm = ({
  kycVerified,
  onDone,
  initialName = "",
}: {
  kycVerified: boolean
  onDone: () => void
  initialName?: string
}) => {
  const [name, setName] = useState(initialName)
  const [city, setCity] = useState("")
  const [vehicle, setVehicle] = useState("")
  const [message, setMessage] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const submit = () => {
    setMessage(null)
    if (!city.trim()) return setMessage("Tell us the city you'll deliver in.")
    startTransition(async () => {
      const res = await applyCourier({
        name: name.trim() || undefined,
        city: city.trim(),
        vehicle: vehicle.trim() || undefined,
      })
      if (res.success) {
        setMessage(null)
        onDone()
      } else {
        setMessage(res.error)
      }
    })
  }

  return (
    <div className="space-y-3">
      {!kycVerified && (
        <div className="rounded-medium border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
          <p className="font-medium">Verify your phone number first</p>
          <p className="mt-1 text-xs">
            Couriers need a verified phone number (minimum KYC level). Verify it
            in the Verification tab, then come back to apply.
          </p>
          <LocalizedClientLink
            href="/account/verification"
            className="mt-2 inline-block text-xs font-medium text-amber-900 underline hover:text-amber-950"
          >
            Go to Verification →
          </LocalizedClientLink>
        </div>
      )}
      <div>
        <label className="mb-1 block text-xs text-ink-muted">Full name (optional)</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Your name"
          className="w-full rounded-medium border border-ink-hairline px-3 py-2 text-sm text-ink outline-none focus:border-ink"
        />
      </div>
      <div>
        <label className="mb-1 block text-xs text-ink-muted">City you deliver in</label>
        <input
          value={city}
          onChange={(e) => setCity(e.target.value)}
          placeholder="e.g. Lagos, Ikeja"
          className="w-full rounded-medium border border-ink-hairline px-3 py-2 text-sm text-ink outline-none focus:border-ink"
        />
      </div>
      <div>
        <label className="mb-1 block text-xs text-ink-muted">Vehicle (optional)</label>
        <input
          value={vehicle}
          onChange={(e) => setVehicle(e.target.value)}
          placeholder="e.g. Motorcycle, bicycle, car"
          className="w-full rounded-medium border border-ink-hairline px-3 py-2 text-sm text-ink outline-none focus:border-ink"
        />
      </div>
      <button
        type="button"
        disabled={isPending || !kycVerified}
        onClick={submit}
        className="w-full rounded-medium bg-ink px-3 py-2 text-sm font-medium text-white hover:bg-ink/90 disabled:opacity-50"
      >
        {isPending ? "Applying…" : "Apply to be a courier"}
      </button>
      {message && <p className="text-xs text-ink-muted">{message}</p>}
    </div>
  )
}

const CourierDashboard = ({
  customer,
  me,
}: {
  customer: { email?: string | null; first_name?: string | null; last_name?: string | null } | null
  me: CourierMe | null
}) => {
  const [refreshKey, setRefreshKey] = useState(0)
  void refreshKey

  const courier = me?.courier ?? null
  const kycVerified = !!me?.kyc?.phone_verified
  const earnings = me?.earnings ?? 0
  const jobs = me?.jobs ?? []
  const displayName = getDisplayName(customer)

  return (
    <div className="w-full max-w-3xl space-y-6">
      <div>
        <h1 className="font-display text-2xl font-medium text-ink">Courier</h1>
        <p className="mt-1 text-sm text-ink-muted">
          Sign in with an account, verify your phone, and apply to earn by
          delivering packages.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 small:grid-cols-3">
        <div className="rounded-large border border-ink-hairline bg-paper-surface p-4">
          <p className="text-xs text-ink-muted">Application</p>
          {courier ? (
            <p className="mt-1 flex items-center gap-2">
              <span
                className={`rounded-full px-2 py-0.5 text-xs font-medium ${badge(courier.status)}`}
              >
                {courier.status}
              </span>
            </p>
          ) : (
            <p className="mt-1 text-sm text-ink">Not applied</p>
          )}
          {courier?.city && <p className="mt-1 text-xs text-ink-muted">{courier.city}</p>}
          {courier?.vehicle && (
            <p className="text-xs text-ink-muted">{courier.vehicle}</p>
          )}
        </div>
        <div className="rounded-large border border-ink-hairline bg-paper-surface p-4">
          <p className="text-xs text-ink-muted">KYC level</p>
          <p className="mt-1 text-sm font-medium text-ink">{me?.kyc?.level ?? "unverified"}</p>
          <p className="mt-1 text-xs text-ink-muted">
            {kycVerified ? "Phone verified — you can courier." : "Verify your phone to courier."}
          </p>
        </div>
        <div className="rounded-large border border-ink-hairline bg-paper-surface p-4">
          <p className="text-xs text-ink-muted">Lifetime earnings</p>
          <p className="mt-1 font-mono tabular-nums text-lg text-ink">{ngn(earnings)}</p>
          <p className="mt-1 text-xs text-ink-muted">Released delivery payouts</p>
        </div>
      </div>

      {!courier ? (
        <div className="rounded-large border border-ink-hairline bg-paper-surface p-4">
          <h2 className="font-display text-lg font-medium text-ink">Become a courier</h2>
          <p className="mt-1 text-sm text-ink-muted">
            Apply once, then browse the delivery board and make offers on jobs
            near you. Pickup and delivery payouts land in your wallet.
          </p>
          <div className="mt-4">
            <ApplyForm
              key={customer?.email ?? "guest"}
              kycVerified={kycVerified}
              initialName={displayName ?? ""}
              onDone={() => {
                setRefreshKey((k) => k + 1)
                window.location.reload()
              }}
            />
          </div>
        </div>
      ) : (
        <div className="rounded-large border border-ink-hairline bg-paper-surface p-4">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-lg font-medium text-ink">My jobs</h2>
            <LocalizedClientLink
              href="/deliver"
              className="text-sm font-medium text-ink underline hover:text-ink-muted"
            >
              Browse the board →
            </LocalizedClientLink>
          </div>
          {jobs.length === 0 ? (
            <p className="mt-3 text-sm text-ink-muted">
              No offers yet. Head to the delivery board to find a job near you.
            </p>
          ) : (
            <ul className="mt-3 divide-y divide-ink-hairline">
              {jobs.slice(0, 20).map((item) => (
                <li key={item.offer_id} className="flex items-center justify-between gap-3 py-3 text-sm">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-ink">
                      {item.job?.package_description ?? "Delivery job"}
                    </p>
                    <p className="text-xs text-ink-muted">
                      {item.job ? `${item.job.pickup_address} → ${item.job.destination_address}` : ""}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <span className="font-mono tabular-nums text-ink">
                      {ngn(item.offered_price)}
                    </span>
                    <span className="rounded-full bg-ink/10 px-2 py-0.5 text-xs text-ink">
                      {item.offer_status}
                    </span>
                    {item.job && (
                      <span className="rounded-full bg-ink/10 px-2 py-0.5 text-xs text-ink">
                        {statusLabel[item.job.status] ?? item.job.status}
                      </span>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}

export default CourierDashboard

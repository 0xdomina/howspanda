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

// Courierhood is activated by the KYC ladder itself — reaching the
// phone-verified level makes any signed-in account an active courier.
const DetailsForm = ({
  active,
  onDone,
  initialName = "",
  initialCity = "",
  initialVehicle = "",
}: {
  active: boolean
  onDone: () => void
  initialName?: string
  initialCity?: string
  initialVehicle?: string
}) => {
  const [name, setName] = useState(initialName)
  const [city, setCity] = useState(initialCity)
  const [vehicle, setVehicle] = useState(initialVehicle)
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
        disabled={isPending || !active}
        onClick={submit}
        className="w-full rounded-medium bg-ink px-3 py-2 text-sm font-medium text-white hover:bg-ink/90 disabled:opacity-50"
      >
        {isPending ? "Saving…" : "Save courier details"}
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
  const kycLevel = me?.kyc?.level ?? "unverified"
  const kycVerified =
    kycLevel === "profile_completed" || kycLevel === "identity_verified"
  const suspended = courier?.status === "suspended"
  const active = kycVerified && !suspended
  const earnings = me?.earnings ?? 0
  const jobs = me?.jobs ?? []
  const displayName = getDisplayName(customer)

  return (
    <div className="w-full max-w-3xl space-y-6">
      <div>
        <h1 className="font-display text-2xl font-medium text-ink">Courier</h1>
        <p className="mt-1 text-sm text-ink-muted">
          Sign in with an account, verify your phone, and complete your profile
          — the KYC level itself activates courierhood. Then earn by delivering
          packages.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 small:grid-cols-3">
        <div className="rounded-large border border-ink-hairline bg-paper-surface p-4">
          <p className="text-xs text-ink-muted">Courier status</p>
          {suspended ? (
            <p className="mt-1 flex items-center gap-2">
              <span className="rounded-full bg-rose-50 px-2 py-0.5 text-xs font-medium text-rose-700">
                Suspended
              </span>
            </p>
          ) : active ? (
            <p className="mt-1 flex items-center gap-2">
              <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
                Active
              </span>
            </p>
          ) : (
            <p className="mt-1 text-sm text-ink">Not active</p>
          )}
          {active && (
            <p className="mt-1 text-xs text-ink-muted">
              Profile complete — you can make offers.
            </p>
          )}
        </div>
        <div className="rounded-large border border-ink-hairline bg-paper-surface p-4">
          <p className="text-xs text-ink-muted">KYC level</p>
          <p className="mt-1 text-sm font-medium text-ink">{kycLevel}</p>
          <p className="mt-1 text-xs text-ink-muted">
            {active
              ? "Courierhood is active."
              : "Complete the KYC profile step to activate courierhood."}
          </p>
        </div>
        <div className="rounded-large border border-ink-hairline bg-paper-surface p-4">
          <p className="text-xs text-ink-muted">Lifetime earnings</p>
          <p className="mt-1 font-mono tabular-nums text-lg text-ink">{ngn(earnings)}</p>
          <p className="mt-1 text-xs text-ink-muted">Released delivery payouts</p>
        </div>
      </div>

      {suspended ? (
        <div className="rounded-large border border-rose-300 bg-rose-50 p-4">
          <h2 className="font-display text-lg font-medium text-rose-800">Courier account suspended</h2>
          <p className="mt-1 text-sm text-rose-700">
            You can still browse the delivery board, but offers and pickups are
            disabled. Contact support if you think this is a mistake.
          </p>
        </div>
      ) : active ? (
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

          <div className="mt-5 border-t border-ink-hairline pt-4">
            <h2 className="font-display text-lg font-medium text-ink">Courier details</h2>
            <p className="mt-1 text-sm text-ink-muted">
              Set the city and vehicle the delivery board shows for your offers.
            </p>
            <div className="mt-4">
              <DetailsForm
                key={customer?.email ?? "guest"}
                active={active}
                initialName={displayName ?? courier?.name ?? ""}
                initialCity={courier?.city ?? ""}
                initialVehicle={courier?.vehicle ?? ""}
                onDone={() => {
                  setRefreshKey((k) => k + 1)
                  window.location.reload()
                }}
              />
            </div>
          </div>
        </div>
      ) : (
        <div className="rounded-large border border-amber-300 bg-amber-50 p-4">
          <h2 className="font-display text-lg font-medium text-amber-900">Activate courierhood</h2>
          <p className="mt-1 text-sm text-amber-800">
            Verify your phone and complete your profile (the profile_completed
            KYC level) and you&apos;ll be an active courier — no application or
            approval needed.
          </p>
          <LocalizedClientLink
            href="/account/verification"
            className="mt-3 inline-block text-sm font-medium text-amber-900 underline hover:text-amber-950"
          >
            Go to Verification →
          </LocalizedClientLink>
        </div>
      )}
    </div>
  )
}

export default CourierDashboard

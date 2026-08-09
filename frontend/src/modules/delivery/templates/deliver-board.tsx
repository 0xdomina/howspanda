"use client"

import { useTransition, useState } from "react"
import LocalizedClientLink from "@modules/common/components/localized-client-link"
import {
  listOpenDeliveryJobs,
  reverseGeocode,
} from "@lib/data/delivery"

const ngn = (v: number | string | undefined) =>
  new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    maximumFractionDigits: 0,
  }).format(Number(v ?? 0))

const km = (v: number | null | undefined) =>
  Number.isFinite(v) ? `${v!.toFixed(1)} km` : null

const statusLabel: Record<string, string> = {
  open: "Open for offers",
  negotiating: "Negotiating",
  accepted: "Accepted",
  in_transit: "In transit",
  delivered: "Delivered",
  cancelled: "Cancelled",
}

const JobCard = ({ job }: { job: any }) => (
  <div className="figma-surface flex flex-col p-5">
    <div className="flex items-start justify-between gap-3">
      <LocalizedClientLink href={`/deliver/${job.id}`} className="min-w-0">
        <h3 className="font-display text-lg font-medium text-ink hover:underline">
          {job.package_description}
        </h3>
      </LocalizedClientLink>
      <span className="shrink-0 rounded-full bg-ink/10 px-2 py-0.5 text-xs text-ink">
        {statusLabel[job.status] ?? job.status}
      </span>
    </div>
    {job.package_weight && (
      <p className="mt-1 text-xs text-ink-muted">Weight: {job.package_weight}</p>
    )}
    {job.pickup_distance_km != null && (
      <p className="mt-1.5 inline-flex w-fit items-center rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
        {km(job.pickup_distance_km)} from you
      </p>
    )}
    <div className="mt-3 space-y-2 rounded-medium bg-ink/5 p-3 text-sm">
      <p className="text-ink">
        <span className="text-ink-muted">Pickup:</span> {job.pickup_address}
      </p>
      <p className="text-ink">
        <span className="text-ink-muted">Deliver to:</span> {job.destination_address}
      </p>
    </div>
    <div className="mt-3 flex items-center justify-between">
      <p className="font-mono tabular-nums text-ink">{ngn(job.posted_price)}</p>
      <LocalizedClientLink
        href={`/deliver/${job.id}`}
        className="text-sm font-medium text-ink underline hover:text-ink-muted"
      >
        View & offer
      </LocalizedClientLink>
    </div>
  </div>
)

const DeliverBoardClient = ({ jobs }: { jobs: any[] }) => {
  const [city, setCity] = useState("")
  const [radiusKm, setRadiusKm] = useState(25)
  const [loc, setLoc] = useState<{ lat: number; lng: number } | null>(null)
  const [locLabel, setLocLabel] = useState<string | null>(null)
  const [locBusy, setLocBusy] = useState(false)
  const [filtered, setFiltered] = useState(jobs)
  const [isPending, startTransition] = useTransition()

  const refresh = (params?: {
    city?: string
    lat?: number
    lng?: number
    radiusKm?: number
  }) => {
    startTransition(async () => {
      const result = await listOpenDeliveryJobs(params)
      setFiltered(result)
    })
  }

  const applyFilter = () => {
    refresh({
      city: city.trim() || undefined,
      lat: loc?.lat,
      lng: loc?.lng,
      radiusKm: loc ? radiusKm : undefined,
    })
  }

  const useMyLocation = () => {
    setLocBusy(true)
    if (!("geolocation" in navigator)) {
      setLocBusy(false)
      setLocLabel("Geolocation is not available in this browser.")
      return
    }
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude: lat, longitude: lng } = pos.coords
        setLoc({ lat, lng })
        const rev = await reverseGeocode(lat, lng)
        setLocLabel(
          rev ? `${rev.city ?? rev.displayName}` : `${lat.toFixed(4)}, ${lng.toFixed(4)}`
        )
        setLocBusy(false)
        refresh({ lat, lng, radiusKm, city: city.trim() || undefined })
      },
      () => {
        setLocBusy(false)
        setLocLabel("Location permission denied.")
      }
    )
  }

  const clearLocation = () => {
    setLoc(null)
    setLocLabel(null)
    refresh({ city: city.trim() || undefined })
  }

  return (
    <div data-testid="deliver-page" className="figma-container flex-1 py-10 small:py-16">
      <div className="mb-8 max-w-2xl">
        <h1 className="font-display text-3xl font-medium tracking-[-0.02em] text-ink">
          Deliver
        </h1>
        <p className="mt-2 max-w-xl text-sm text-ink-muted">
          Browse open delivery jobs near you. Make an offer, pick up the package,
          and get paid on confirmed delivery. Couriers are verified account holders —
          sign in, verify your ID, and start delivering from the same account.
        </p>
      </div>

      <div className="mb-6 flex flex-col gap-2 small:flex-row small:items-center">
        <input
          type="text"
          value={city}
          onChange={(e) => setCity(e.target.value)}
          placeholder="Filter by city"
          className="w-full rounded-control border border-ink-hairline bg-white px-3 py-3 text-sm text-ink outline-none focus:border-ink small:max-w-xs"
        />
        <select
          value={radiusKm}
          onChange={(e) => setRadiusKm(Number(e.target.value))}
          disabled={!loc}
          className="w-full rounded-control border border-ink-hairline bg-white px-3 py-3 text-sm text-ink outline-none focus:border-ink disabled:opacity-50 small:w-auto"
        >
          <option value={5}>Within 5 km</option>
          <option value={10}>Within 10 km</option>
          <option value={25}>Within 25 km</option>
          <option value={50}>Within 50 km</option>
          <option value={100}>Within 100 km</option>
        </select>
        <button
          type="button"
          disabled={isPending || locBusy}
          onClick={useMyLocation}
          className="rounded-control border border-ink-strong px-4 py-3 text-sm font-medium text-ink hover:bg-ink hover:text-white disabled:opacity-50"
        >
          {locBusy ? "Locating…" : loc ? "Refresh near me" : "Use my location"}
        </button>
        <button
          type="button"
          disabled={isPending}
          onClick={applyFilter}
          className="rounded-control border border-ink-strong px-4 py-3 text-sm font-medium text-ink hover:bg-ink hover:text-white disabled:opacity-50"
        >
          {isPending ? "Searching…" : "Search"}
        </button>
      </div>

      {(locLabel || loc) && (
        <div className="mb-4 flex flex-wrap items-center gap-2 rounded-medium bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          {loc && (
            <span className="font-medium">
              Near {locLabel} · {radiusKm} km
            </span>
          )}
          {!loc && locLabel && <span>{locLabel}</span>}
          {loc && (
            <button
              type="button"
              onClick={clearLocation}
              className="text-xs font-medium text-emerald-700 underline hover:text-emerald-900"
            >
              Clear
            </button>
          )}
        </div>
      )}

      {filtered.length === 0 ? (
        <div className="rounded-control border border-dashed border-ink-hairline bg-white py-16 text-center">
          <p className="text-ink-muted">No open delivery jobs right now.</p>
          <p className="mt-1 text-sm text-ink-muted">
            Check back soon — sellers post jobs from completed orders.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 small:grid-cols-2">
          {filtered.map((job) => (
            <JobCard key={job.id} job={job} />
          ))}
        </div>
      )}
    </div>
  )
}

export default DeliverBoardClient

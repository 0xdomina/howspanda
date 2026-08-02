"use client"

import { useTransition, useState } from "react"
import { postDeliveryJob, acceptOffer } from "@lib/data/delivery"

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

const PostJobForm = ({
  orders,
  onDone,
}: {
  orders: any[]
  onDone: () => void
}) => {
  const [orderId, setOrderId] = useState("")
  const [packageDescription, setPackageDescription] = useState("")
  const [packageWeight, setPackageWeight] = useState("")
  const [pickupAddress, setPickupAddress] = useState("")
  const [destinationAddress, setDestinationAddress] = useState("")
  const [destinationPhone, setDestinationPhone] = useState("")
  const [postedPrice, setPostedPrice] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const submit = () => {
    setError(null)
    if (packageDescription.trim().length < 3) {
      setError("Describe the package.")
      return
    }
    if (!pickupAddress.trim() || !destinationAddress.trim()) {
      setError("Pickup and destination addresses are required.")
      return
    }
    const price = Number(postedPrice)
    if (!Number.isFinite(price) || price <= 0) {
      setError("Enter a positive price for the job.")
      return
    }
    startTransition(async () => {
      const res = await postDeliveryJob({
        orderId: orderId.trim() || undefined,
        packageDescription: packageDescription.trim(),
        packageWeight: packageWeight.trim() || undefined,
        pickupAddress: pickupAddress.trim(),
        destinationAddress: destinationAddress.trim(),
        destinationPhone: destinationPhone.trim() || undefined,
        postedPrice: price,
      })
      if (res.success) {
        setError(null)
        onDone()
      } else {
        setError(res.error)
      }
    })
  }

  return (
    <div className="rounded-large border border-ink-hairline bg-paper-surface p-4">
      <h3 className="font-display text-lg font-medium text-ink">Post a delivery job</h3>
      <p className="mt-1 text-xs text-ink-muted">
        Post a package from a completed order and let couriers bid on it. They
        get paid from escrow on confirmed delivery.
      </p>
      <div className="mt-3 space-y-3">
        <div>
          <label className="mb-1 block text-xs text-ink-muted">Linked order (optional)</label>
          <select
            value={orderId}
            onChange={(e) => setOrderId(e.target.value)}
            className="w-full rounded-medium border border-ink-hairline px-3 py-2 text-sm text-ink outline-none focus:border-ink"
          >
            <option value="">No linked order</option>
            {orders
              .filter((o) => o.status === "completed")
              .map((o) => (
                <option key={o.id} value={o.id}>
                  {o.id}
                </option>
              ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs text-ink-muted">Package description</label>
          <input
            type="text"
            value={packageDescription}
            onChange={(e) => setPackageDescription(e.target.value)}
            placeholder="e.g. 2 kg of ankara fabrics"
            className="w-full rounded-medium border border-ink-hairline px-3 py-2 text-sm text-ink outline-none focus:border-ink"
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-xs text-ink-muted">Weight</label>
            <input
              type="text"
              value={packageWeight}
              onChange={(e) => setPackageWeight(e.target.value)}
              placeholder="e.g. 2 kg"
              className="w-full rounded-medium border border-ink-hairline px-3 py-2 text-sm text-ink outline-none focus:border-ink"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-ink-muted">Price (₦)</label>
            <input
              type="number"
              min="1"
              value={postedPrice}
              onChange={(e) => setPostedPrice(e.target.value)}
              placeholder="Opening price"
              className="w-full rounded-medium border border-ink-hairline px-3 py-2 text-sm text-ink outline-none focus:border-ink"
            />
          </div>
        </div>
        <div>
          <label className="mb-1 block text-xs text-ink-muted">Pickup address</label>
          <input
            type="text"
            value={pickupAddress}
            onChange={(e) => setPickupAddress(e.target.value)}
            placeholder="Lagos, Nigeria"
            className="w-full rounded-medium border border-ink-hairline px-3 py-2 text-sm text-ink outline-none focus:border-ink"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs text-ink-muted">Destination address</label>
          <input
            type="text"
            value={destinationAddress}
            onChange={(e) => setDestinationAddress(e.target.value)}
            placeholder="Abuja, Nigeria"
            className="w-full rounded-medium border border-ink-hairline px-3 py-2 text-sm text-ink outline-none focus:border-ink"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs text-ink-muted">Recipient phone (optional)</label>
          <input
            type="text"
            value={destinationPhone}
            onChange={(e) => setDestinationPhone(e.target.value)}
            placeholder="+234…"
            className="w-full rounded-medium border border-ink-hairline px-3 py-2 text-sm text-ink outline-none focus:border-ink"
          />
        </div>
        <button
          type="button"
          disabled={isPending}
          onClick={submit}
          className="w-full rounded-medium bg-ink px-3 py-2 text-sm font-medium text-white hover:bg-ink/90 disabled:opacity-50"
        >
          {isPending ? "Posting…" : "Post job"}
        </button>
        {error && <p className="text-sm text-rose-600">{error}</p>}
      </div>
    </div>
  )
}

const JobCard = ({
  job,
  onAccept,
}: {
  job: any
  onAccept: (offerId: string) => void
}) => {
  const [isPending, startTransition] = useTransition()
  const offers = job.offers ?? []
  const pendingOffers = offers.filter((o: any) => o.status === "pending")

  return (
    <div className="rounded-large border border-ink-hairline bg-paper-surface p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-display text-lg font-medium text-ink">
            {job.package_description}
          </h3>
          <p className="mt-1 text-xs text-ink-muted">Order: {job.order_id ?? "manual"}</p>
        </div>
        <span
          className={`shrink-0 rounded-full px-2 py-0.5 text-xs ${
            job.status === "delivered"
              ? "bg-emerald-50 text-emerald-700"
              : job.status === "cancelled"
              ? "bg-rose-50 text-rose-700"
              : "bg-ink/10 text-ink"
          }`}
        >
          {statusLabel[job.status] ?? job.status}
        </span>
      </div>
      <div className="mt-3 space-y-1 rounded-medium bg-ink/5 p-3 text-sm">
        <p className="text-ink">
          <span className="text-ink-muted">Pickup:</span> {job.pickup_address}
        </p>
        <p className="text-ink">
          <span className="text-ink-muted">Deliver to:</span> {job.destination_address}
        </p>
        <p className="font-mono tabular-nums text-ink">{ngn(job.posted_price)}</p>
      </div>

      {offers.length > 0 && (
        <div className="mt-3">
          <p className="text-sm font-medium text-ink">
            Offers ({offers.length})
          </p>
          <ul className="mt-1 divide-y divide-ink-hairline">
            {offers.map((o: any) => (
              <li key={o.id} className="flex items-center justify-between py-2 text-sm">
                <div className="min-w-0">
                  <p className="truncate text-ink-muted">{o.courier_email}</p>
                  <p className="font-mono tabular-nums text-ink">{ngn(o.offered_price)}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="rounded-full bg-ink/10 px-2 py-0.5 text-xs">{o.status}</span>
                  {o.status === "pending" && (
                    <button
                      type="button"
                      disabled={isPending}
                      onClick={() => startTransition(() => onAccept(o.id))}
                      className="rounded-medium bg-emerald-600 px-3 py-1 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
                    >
                      Accept
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

const SellerDeliveryClient = ({ jobs, orders }: { jobs: any[]; orders: any[] }) => {
  const [refresh, setRefresh] = useState(0)
  const [notice, setNotice] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const handleAccept = (offerId: string) => {
    const job = jobs.find((j) => (j.offers ?? []).some((o: any) => o.id === offerId))
    if (!job) return
    startTransition(async () => {
      const res = await acceptOffer(job.id, offerId)
      setNotice(res.success ? "Offer accepted — the job is locked." : res.error)
      setRefresh((n) => n + 1)
    })
  }

  return (
    <div data-testid="seller-delivery-page" className="flex flex-col gap-6 small:flex-row small:items-start">
      <div className="w-full small:max-w-sm">
        <PostJobForm orders={orders} onDone={() => setRefresh((n) => n + 1)} />
      </div>
      <div className="flex-1">
        <h2 className="font-display text-xl font-medium text-ink">My delivery jobs</h2>
        {notice && <p className="mt-2 text-sm text-ink-muted">{notice}</p>}
        {jobs.length === 0 ? (
          <div className="mt-4 rounded-large border border-dashed py-12 text-center">
            <p className="text-ink-muted">No delivery jobs yet.</p>
            <p className="mt-1 text-sm text-ink-muted">
              Post one from a completed order and couriers can start bidding.
            </p>
          </div>
        ) : (
          <div className="mt-4 space-y-4">
            {jobs.map((job) => (
              <JobCard key={job.id} job={job} onAccept={handleAccept} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export default SellerDeliveryClient

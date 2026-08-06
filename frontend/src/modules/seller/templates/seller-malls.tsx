"use client"

import { useTransition, useState } from "react"
import LocalizedClientLink from "@modules/common/components/localized-client-link"
import {
  createMall,
  joinMallAsSeller,
  relaunchMall,
  cancelMall,
} from "@lib/data/mall"

const ngn = (v: number | string | undefined) =>
  new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    maximumFractionDigits: 0,
  }).format(Number(v ?? 0))

const statusLabel: Record<string, string> = {
  pending: "Gathering sellers",
  active: "Live now",
  settling: "Settling",
  expired: "Expired",
  cancelled: "Cancelled",
  closed: "Closed",
}

const CreateMallForm = ({ onDone }: { onDone: () => void }) => {
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [prizePoolNgn, setPrizePoolNgn] = useState("")
  const [prizeWinnerCount, setPrizeWinnerCount] = useState("3")
  const [prizeDistribution, setPrizeDistribution] = useState<"equal" | "random">(
    "equal"
  )
  const [targetSellers, setTargetSellers] = useState("5")
  const [targetBuyers, setTargetBuyers] = useState("10")
  const [durationDays, setDurationDays] = useState("7")
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const submit = () => {
    setError(null)
    const pool = Number(prizePoolNgn)
    const winners = Number(prizeWinnerCount)
    if (!name.trim() || !pool || pool <= 0 || !winners || winners <= 0) {
      setError("Give the mall a name, a positive prize pool, and at least 1 winner.")
      return
    }
    startTransition(async () => {
      const res = await createMall({
        name: name.trim(),
        description: description.trim() || undefined,
        prizePoolNgn: pool,
        prizeWinnerCount: winners,
        prizeDistribution,
        targetSellers: Number(targetSellers) || undefined,
        targetBuyers: Number(targetBuyers) || undefined,
        durationDays: Number(durationDays) || undefined,
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
      <h3 className="font-display text-lg font-medium text-ink">Create a mall</h3>
      <div className="mt-3 space-y-3">
        <div>
          <label className="mb-1 block text-xs text-ink-muted">Mall name</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Lagos Summer Market"
            className="w-full rounded-medium border border-ink-hairline px-3 py-2 text-sm text-ink outline-none focus:border-ink"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs text-ink-muted">Description</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            placeholder="What makes this mall special?"
            className="w-full rounded-medium border border-ink-hairline px-3 py-2 text-sm text-ink outline-none focus:border-ink"
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-xs text-ink-muted">Prize pool (₦)</label>
            <input
              type="number"
              value={prizePoolNgn}
              onChange={(e) => setPrizePoolNgn(e.target.value)}
              placeholder="30000"
              inputMode="numeric"
              className="w-full rounded-medium border border-ink-hairline px-3 py-2 text-sm text-ink outline-none focus:border-ink"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-ink-muted">Winners</label>
            <input
              type="number"
              value={prizeWinnerCount}
              onChange={(e) => setPrizeWinnerCount(e.target.value)}
              inputMode="numeric"
              className="w-full rounded-medium border border-ink-hairline px-3 py-2 text-sm text-ink outline-none focus:border-ink"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-ink-muted">Target sellers</label>
            <input
              type="number"
              value={targetSellers}
              onChange={(e) => setTargetSellers(e.target.value)}
              inputMode="numeric"
              className="w-full rounded-medium border border-ink-hairline px-3 py-2 text-sm text-ink outline-none focus:border-ink"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-ink-muted">Target buyers</label>
            <input
              type="number"
              value={targetBuyers}
              onChange={(e) => setTargetBuyers(e.target.value)}
              inputMode="numeric"
              className="w-full rounded-medium border border-ink-hairline px-3 py-2 text-sm text-ink outline-none focus:border-ink"
            />
          </div>
        </div>
        <p className="text-xs text-ink-muted">
          Your contribution funds the prize pool net of a 20% platform fee —{" "}
          {ngn(Number(prizePoolNgn) * 0.8)} of the pledge goes in, shown as the
          pool&apos;s displayed value.
        </p>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-xs text-ink-muted">Duration (days)</label>
            <input
              type="number"
              value={durationDays}
              onChange={(e) => setDurationDays(e.target.value)}
              inputMode="numeric"
              className="w-full rounded-medium border border-ink-hairline px-3 py-2 text-sm text-ink outline-none focus:border-ink"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-ink-muted">Prize distribution</label>
            <select
              value={prizeDistribution}
              onChange={(e) =>
                setPrizeDistribution(e.target.value as "equal" | "random")
              }
              className="w-full rounded-medium border border-ink-hairline px-3 py-2 text-sm text-ink outline-none focus:border-ink"
            >
              <option value="equal">Equal</option>
              <option value="random">Random</option>
            </select>
          </div>
        </div>
        {error && <p className="text-sm text-rose-600">{error}</p>}
        <button
          type="button"
          disabled={isPending}
          onClick={submit}
          className="w-full rounded-medium bg-ink px-3 py-2 text-sm font-medium text-white hover:bg-ink/90 disabled:opacity-50"
        >
          {isPending ? "Creating…" : "Create mall"}
        </button>
      </div>
    </div>
  )
}

const JoinMallForm = ({ onDone }: { onDone: () => void }) => {
  const [mallId, setMallId] = useState("")
  const [contribution, setContribution] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const submit = () => {
    setError(null)
    const amount = Number(contribution)
    if (!mallId.trim() || !amount || amount <= 0) {
      setError("Enter the mall id and a positive contribution.")
      return
    }
    startTransition(async () => {
      const res = await joinMallAsSeller(mallId.trim(), amount)
      if (res.success) {
        setMallId("")
        setContribution("")
        onDone()
      } else {
        setError(res.error)
      }
    })
  }

  return (
    <div className="rounded-large border border-ink-hairline bg-paper-surface p-4">
      <h3 className="font-display text-lg font-medium text-ink">Join a mall</h3>
      <p className="mt-1 text-xs text-ink-muted">
        Contribute to a mall&apos;s prize pool to grow it and help it go live.
      </p>
      <div className="mt-3 space-y-3">
        <div>
          <label className="mb-1 block text-xs text-ink-muted">Mall id</label>
          <input
            value={mallId}
            onChange={(e) => setMallId(e.target.value)}
            placeholder="Paste the mall id"
            className="w-full rounded-medium border border-ink-hairline px-3 py-2 text-sm text-ink outline-none focus:border-ink"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs text-ink-muted">Contribution (₦)</label>
          <input
            type="number"
            value={contribution}
            onChange={(e) => setContribution(e.target.value)}
            placeholder="10000"
            inputMode="numeric"
            className="w-full rounded-medium border border-ink-hairline px-3 py-2 text-sm text-ink outline-none focus:border-ink"
          />
        </div>
        <p className="text-xs text-ink-muted">
          {ngn(Number(contribution) * 0.8)} goes into the prize pool; the
          platform keeps a 20% fee. Refunds are full if the mall never launches.
        </p>
        {error && <p className="text-sm text-rose-600">{error}</p>}
        <button
          type="button"
          disabled={isPending}
          onClick={submit}
          className="w-full rounded-medium bg-ink px-3 py-2 text-sm font-medium text-white hover:bg-ink/90 disabled:opacity-50"
        >
          {isPending ? "Joining…" : "Join mall"}
        </button>
      </div>
    </div>
  )
}

const LifecycleActions = ({
  mall,
  sellerId,
  onDone,
}: {
  mall: any
  sellerId: string | null
  onDone: () => void
}) => {
  const [message, setMessage] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  // Only the mall creator can re-launch or cancel it.
  if (!sellerId || mall.created_by_seller_id !== sellerId) {
    return null
  }
  if (mall.status !== "expired" && mall.status !== "pending") {
    return null
  }

  const relaunch = () => {
    setMessage(null)
    startTransition(async () => {
      const res = await relaunchMall(mall.id)
      setMessage(res.success ? "Mall re-launched and live again." : res.error)
      if (res.success) onDone()
    })
  }

  const cancel = () => {
    setMessage(null)
    const note =
      mall.starts_at
        ? "Cancelling refunds the remaining prize pool pro-rata to sellers."
        : "Cancelling refunds every seller's full contribution."
    if (!window.confirm(`Cancel “${mall.name}”? ${note}`)) return
    startTransition(async () => {
      const res = await cancelMall(mall.id)
      setMessage(res.success ? "Mall cancelled." : res.error)
      if (res.success) onDone()
    })
  }

  return (
    <div className="flex flex-col items-end gap-1.5">
      <div className="flex gap-2">
        {mall.status === "expired" && (
          <button
            type="button"
            disabled={isPending}
            onClick={relaunch}
            className="rounded-medium bg-ink px-3 py-1.5 text-xs font-medium text-white hover:bg-ink/90 disabled:opacity-50"
          >
            {isPending ? "Working…" : "Re-launch"}
          </button>
        )}
        <button
          type="button"
          disabled={isPending}
          onClick={cancel}
          className="rounded-medium border border-ink-strong px-3 py-1.5 text-xs font-medium text-ink hover:bg-ink hover:text-white disabled:opacity-50"
        >
          Cancel
        </button>
      </div>
      {message && <p className="text-xs text-ink-muted">{message}</p>}
    </div>
  )
}

const SellerMallsClient = ({
  malls,
  sellerId,
}: {
  malls: any[]
  sellerId: string | null
}) => {
  const [refresh, setRefresh] = useState(0)
  const reload = () => {
    setRefresh((r) => r + 1)
    window.location.reload()
  }

  return (
    <div data-testid="seller-malls-page" className="space-y-6">
      <h2 className="font-display text-2xl font-medium tracking-[-0.02em] text-ink">
        Malls
      </h2>

      <div className="grid grid-cols-1 gap-6 small:grid-cols-2">
        <CreateMallForm onDone={reload} />
        <JoinMallForm onDone={reload} />
      </div>

      <div className="rounded-large border border-ink-hairline bg-paper-surface p-4">
        <h3 className="font-display text-lg font-medium text-ink">
          Your malls ({malls.length})
        </h3>
        {malls.length === 0 ? (
          <p className="mt-2 text-sm text-ink-muted">
            You haven&apos;t created or joined a mall yet.
          </p>
        ) : (
          <ul className="mt-2 divide-y divide-ink-hairline">
            {malls.map((mall: any) => (
              <li
                key={mall.id}
                className="flex flex-col gap-2 py-3 small:flex-row small:items-center small:justify-between"
              >
                <div className="min-w-0">
                  <LocalizedClientLink
                    href={`/malls/${mall.id}`}
                    className="text-ink hover:underline"
                  >
                    {mall.name}
                  </LocalizedClientLink>
                  <p className="text-xs text-ink-muted">
                    {statusLabel[mall.status] ?? mall.status} ·{" "}
                    {mall.created_by_seller_id ? "created" : "joined"} ·{" "}
                    {new Date(mall.expires_at).toLocaleDateString()}
                  </p>
                </div>
                <div className="flex items-center gap-4 text-sm">
                  <span className="font-mono tabular-nums text-ink">
                    {ngn(mall.prize_pool_ngn)} pool
                  </span>
                  <span className="font-mono tabular-nums text-ink-muted">
                    {ngn(mall.remaining_ngn)} left
                  </span>
                </div>
                <LifecycleActions mall={mall} sellerId={sellerId} onDone={reload} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

export default SellerMallsClient

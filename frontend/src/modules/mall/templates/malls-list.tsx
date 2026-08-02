"use client"

import { useTransition, useState } from "react"
import LocalizedClientLink from "@modules/common/components/localized-client-link"
import { joinMallAsBuyer } from "@lib/data/mall"

const ngn = (v: number | string | undefined) =>
  new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    maximumFractionDigits: 0,
  }).format(Number(v ?? 0))

const MallCard = ({ mall }: { mall: any }) => {
  const [email, setEmail] = useState("")
  const [message, setMessage] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const join = () => {
    setMessage(null)
    if (!email.includes("@")) {
      setMessage("Enter your email to join this mall.")
      return
    }
    startTransition(async () => {
      const res = await joinMallAsBuyer(mall.id, email.trim())
      setMessage(
        res.success ? "You're in! Your email is registered for this mall." : res.error
      )
    })
  }

  const statusLabel: Record<string, string> = {
    pending: "Gathering sellers",
    active: "Live now",
    settling: "Settling",
    expired: "Expired",
    cancelled: "Cancelled",
    closed: "Closed",
  }

  return (
    <div className="flex flex-col rounded-large border border-ink-hairline bg-paper-surface p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <LocalizedClientLink href={`/malls/${mall.id}`}>
            <h3 className="font-display text-lg font-medium text-ink hover:underline">
              {mall.name}
            </h3>
          </LocalizedClientLink>
          <p className="mt-1 text-sm text-ink-muted line-clamp-2">
            {mall.description || "A community sales event."}
          </p>
        </div>
        <span
          className={`shrink-0 rounded-full px-2 py-0.5 text-xs ${
            mall.status === "active"
              ? "bg-emerald-50 text-emerald-700"
              : "bg-ink/10 text-ink"
          }`}
        >
          {statusLabel[mall.status] ?? mall.status}
        </span>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2 text-center">
        <div className="rounded-medium bg-ink/5 px-2 py-2">
          <p className="text-xs text-ink-muted">Prize pool</p>
          <p className="mt-0.5 font-mono tabular-nums text-sm text-ink">
            {ngn(mall.prize_pool_ngn)}
          </p>
        </div>
        <div className="rounded-medium bg-ink/5 px-2 py-2">
          <p className="text-xs text-ink-muted">Prizes</p>
          <p className="mt-0.5 font-mono tabular-nums text-sm text-ink">
            {mall.prize_winner_count}
          </p>
        </div>
        <div className="rounded-medium bg-ink/5 px-2 py-2">
          <p className="text-xs text-ink-muted">Sellers</p>
          <p className="mt-0.5 font-mono tabular-nums text-sm text-ink">
            {mall.target_sellers}
          </p>
        </div>
      </div>

      {mall.status === "pending" || mall.status === "active" ? (
        <div className="mt-4">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Your email"
            className="w-full rounded-medium border border-ink-hairline px-3 py-2 text-sm text-ink outline-none focus:border-ink"
          />
          <button
            type="button"
            disabled={isPending}
            onClick={join}
            className="mt-2 w-full rounded-medium bg-ink px-3 py-2 text-sm font-medium text-white hover:bg-ink/90 disabled:opacity-50"
          >
            {isPending ? "Joining…" : "Join this mall"}
          </button>
          {message && <p className="mt-2 text-xs text-ink-muted">{message}</p>}
        </div>
      ) : (
        <p className="mt-4 text-sm text-ink-muted">This mall is no longer open.</p>
      )}
    </div>
  )
}

const MallsClient = ({ malls }: { malls: any[] }) => {
  return (
    <div data-testid="malls-page" className="content-container flex-1 small:py-12">
      <div className="py-8">
        <h1 className="font-display text-3xl font-medium tracking-[-0.02em] text-ink">
          Malls
        </h1>
        <p className="mt-2 max-w-xl text-sm text-ink-muted">
          Community sales events. Join a mall with your email, shop its sellers,
          and every purchase enters you in a prize draw funded by the sellers.
        </p>
      </div>

      {malls.length === 0 ? (
        <div className="rounded-large border border-dashed py-16 text-center">
          <p className="text-ink-muted">No malls are open right now.</p>
          <p className="mt-1 text-sm text-ink-muted">
            Check back soon — a seller near you may be starting one.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 small:grid-cols-2">
          {malls.map((mall) => (
            <MallCard key={mall.id} mall={mall} />
          ))}
        </div>
      )}
    </div>
  )
}

export default MallsClient

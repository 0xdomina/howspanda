"use client"

import { useMemo, useTransition, useState } from "react"
import LocalizedClientLink from "@modules/common/components/localized-client-link"
import { joinMallAsBuyer, type MallWin } from "@lib/data/mall"

const ngn = (v: number | string | undefined) =>
  new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    maximumFractionDigits: 0,
  }).format(Number(v ?? 0))

// Leaderboard-style masking for public win tickers — never show a full email.
const maskEmail = (email: string) => {
  const [local, domain] = email.split("@")
  if (!domain) return email
  return `${local.slice(0, 1)}${"•".repeat(Math.min(3, Math.max(1, local.length - 1)))}@${domain}`
}

const WinTicker = ({ wins }: { wins: MallWin[] }) => {
  if (!wins.length) return null
  return (
    <div className="mb-8 rounded-large border border-ink-hairline bg-paper-surface px-4 py-3">
      <p className="text-xs font-medium uppercase tracking-wide text-ink-muted">
        Recent wins
      </p>
      <ul className="mt-2 flex flex-col gap-1.5">
        {wins.map((w) => (
          <li
            key={w.id}
            className="flex items-center justify-between gap-3 text-sm"
          >
            <span className="truncate text-ink-muted">
              <span className="text-ink">{maskEmail(w.winner_buyer_email)}</span>{" "}
              won in{" "}
              <LocalizedClientLink
                href={`/malls/${w.mall_id}`}
                className="underline-offset-2 hover:underline"
              >
                {w.mall_name}
              </LocalizedClientLink>
            </span>
            <span className="shrink-0 font-mono tabular-nums text-emerald-700">
              +{ngn(w.amount_ngn)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

const MallCard = ({
  mall,
  customerEmail,
  isTop,
}: {
  mall: any
  customerEmail: string | null
  isTop?: boolean
}) => {
  const [message, setMessage] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const join = () => {
    setMessage(null)
    if (!customerEmail) {
      setMessage("Sign in to your account to join this mall.")
      return
    }
    startTransition(async () => {
      const res = await joinMallAsBuyer(mall.id, customerEmail)
      setMessage(
        res.success ? "You're in! Purchases now count toward prize draws." : res.error
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
          <div className="flex items-center gap-2">
            <LocalizedClientLink href={`/malls/${mall.id}`}>
              <h3 className="font-display text-lg font-medium text-ink hover:underline">
                {mall.name}
              </h3>
            </LocalizedClientLink>
            {isTop && (
              <span className="shrink-0 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800">
                Top Mall
              </span>
            )}
          </div>
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
          {customerEmail ? (
            <button
              type="button"
              disabled={isPending}
              onClick={join}
              className="w-full rounded-medium bg-ink px-3 py-2 text-sm font-medium text-white hover:bg-ink/90 disabled:opacity-50"
            >
              {isPending ? "Joining…" : "Join this mall"}
            </button>
          ) : (
            <LocalizedClientLink
              href="/account"
              className="block w-full rounded-medium border border-ink-strong px-3 py-2 text-center text-sm font-medium text-ink hover:bg-ink hover:text-white"
            >
              Sign in to join
            </LocalizedClientLink>
          )}
          {message && <p className="mt-2 text-xs text-ink-muted">{message}</p>}
        </div>
      ) : (
        <p className="mt-4 text-sm text-ink-muted">This mall is no longer open.</p>
      )}
    </div>
  )
}

const MallsClient = ({
  malls,
  wins = [],
  customerEmail,
}: {
  malls: any[]
  wins?: MallWin[]
  customerEmail: string | null
}) => {
  // The "Top Mall" is the active mall with the biggest net prize pool.
  const topId = useMemo(() => {
    let best: string | null = null
    let bestPool = -1
    for (const mall of malls) {
      const pool = Number(mall.prize_pool_ngn ?? 0)
      if (pool > bestPool) {
        bestPool = pool
        best = mall.id
      }
    }
    return best
  }, [malls])

  return (
    <div data-testid="malls-page" className="content-container flex-1 small:py-12">
      <div className="py-8">
        <h1 className="font-display text-3xl font-medium tracking-[-0.02em] text-ink">
          Malls
        </h1>
        <p className="mt-2 max-w-xl text-sm text-ink-muted">
          Community sales events. Join with one click, shop goods from the
          participating stores, and every purchase enters you in a prize draw
          funded by the sellers.
        </p>
      </div>

      <WinTicker wins={wins} />

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
            <MallCard
              key={mall.id}
              mall={mall}
              customerEmail={customerEmail}
              isTop={mall.id === topId}
            />
          ))}
        </div>
      )}
    </div>
  )
}

export default MallsClient

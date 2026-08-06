"use client"

import { useTransition, useState } from "react"
import LocalizedClientLink from "@modules/common/components/localized-client-link"
import { joinMallAsBuyer, recordMallPurchase } from "@lib/data/mall"

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

const GoodCard = ({ good }: { good: any }) => {
  const price = good.variants?.length
    ? Math.min(
        ...good.variants
          .map((v: any) => v.prices?.[0]?.amount ?? Infinity)
          .filter(Number.isFinite)
      )
    : null
  return (
    <LocalizedClientLink
      href={good.handle ? `/products/${good.handle}` : "#"}
      className="group rounded-large border border-ink-hairline bg-paper-surface p-3 transition hover:border-ink"
    >
      <div className="aspect-square overflow-hidden rounded-medium bg-ink/5">
        {good.thumbnail ? (
          <img
            src={good.thumbnail}
            alt={good.title}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-3xl text-ink/20">
            {good.title?.[0]?.toUpperCase() ?? "?"}
          </div>
        )}
      </div>
      <p className="mt-2 truncate text-sm text-ink group-hover:text-ink-muted">
        {good.title}
      </p>
      {price != null && price !== Infinity && (
        <p className="mt-0.5 font-mono tabular-nums text-sm text-ink">
          {ngn(price / 100)}
        </p>
      )}
    </LocalizedClientLink>
  )
}

const MallDetailClient = ({
  mall,
  detail,
  goods = [],
  customerEmail,
}: {
  mall: any
  detail: any
  goods?: any[]
  customerEmail?: string | null
}) => {
  const [orderId, setOrderId] = useState("")
  const [message, setMessage] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const buyers = detail?.buyers ?? []
  const sellers = detail?.sellers ?? []
  const prizes = detail?.prizes ?? []

  const alreadyJoined = customerEmail
    ? buyers.some((b: any) => b.buyer_email === customerEmail)
    : false

  const join = () => {
    setMessage(null)
    if (!customerEmail) {
      setMessage("Sign in to your account to join this mall.")
      return
    }
    startTransition(async () => {
      const res = await joinMallAsBuyer(mall.id, customerEmail)
      setMessage(
        res.success
          ? "You're in! Purchases now count toward prize draws."
          : res.error
      )
    })
  }

  const purchase = () => {
    setMessage(null)
    if (!customerEmail) {
      setMessage("Sign in to your account to record a purchase.")
      return
    }
    if (!orderId.trim()) {
      setMessage("Enter the order id to record a purchase.")
      return
    }
    startTransition(async () => {
      const res = await recordMallPurchase(
        mall.id,
        customerEmail,
        orderId.trim()
      )
      if (!res.success) {
        setMessage(res.error)
      } else if (res.won) {
        setMessage(
          `You won ${ngn(res.prizeAmount)}! The prize is being paid into your wallet.`
        )
      } else {
        setMessage("Purchase recorded. You're entered for the next prize draw.")
      }
    })
  }

  return (
    <div data-testid="mall-detail-page" className="content-container flex-1 small:py-12">
      <div className="py-6">
        <LocalizedClientLink
          href="/malls"
          className="text-sm text-ink-muted hover:text-ink"
        >
          ← All malls
        </LocalizedClientLink>
      </div>

      <div className="flex flex-col gap-6 small:flex-row small:items-start">
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="font-display text-3xl font-medium tracking-[-0.02em] text-ink">
              {mall.name}
            </h1>
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
          <p className="mt-2 text-sm text-ink-muted">
            {mall.description || "A community sales event."}
          </p>

          <div className="mt-6 grid grid-cols-2 gap-3 small:grid-cols-4">
            <div className="rounded-medium border border-ink-hairline bg-paper-surface p-3">
              <p className="text-xs text-ink-muted">Prize pool</p>
              <p className="mt-1 font-mono tabular-nums text-ink">
                {ngn(mall.prize_pool_ngn)}
              </p>
            </div>
            <div className="rounded-medium border border-ink-hairline bg-paper-surface p-3">
              <p className="text-xs text-ink-muted">Remaining</p>
              <p className="mt-1 font-mono tabular-nums text-ink">
                {ngn(mall.remaining_ngn)}
              </p>
            </div>
            <div className="rounded-medium border border-ink-hairline bg-paper-surface p-3">
              <p className="text-xs text-ink-muted">Prizes</p>
              <p className="mt-1 font-mono tabular-nums text-ink">
                {mall.prize_winner_count}
              </p>
            </div>
            <div className="rounded-medium border border-ink-hairline bg-paper-surface p-3">
              <p className="text-xs text-ink-muted">Ends</p>
              <p className="mt-1 text-sm text-ink">
                {new Date(mall.expires_at).toLocaleDateString()}
              </p>
            </div>
          </div>

          {goods.length > 0 && (
            <div className="mt-6">
              <h3 className="font-display text-lg font-medium text-ink">
                Goods from participating stores
              </h3>
              <p className="mt-1 text-xs text-ink-muted">
                Every store in this mall lists its goods here. Shop directly
                from any of them.
              </p>
              <div className="mt-3 grid grid-cols-2 gap-3 small:grid-cols-4">
                {goods.map((g: any) => (
                  <GoodCard key={g.id} good={g} />
                ))}
              </div>
            </div>
          )}

          {sellers.length > 0 && (
            <div className="mt-6 rounded-large border border-ink-hairline bg-paper-surface p-4">
              <h3 className="font-display text-lg font-medium text-ink">
                Participating sellers ({sellers.length})
              </h3>
              <ul className="mt-2 divide-y divide-ink-hairline">
                {sellers.map((s: any) => (
                  <li
                    key={s.id}
                    className="flex items-center justify-between py-2 text-sm"
                  >
                    <span className="text-ink">Seller</span>
                    <span className="font-mono tabular-nums text-ink-muted">
                      {ngn(s.contribution_ngn)} contributed
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <div className="w-full small:max-w-sm space-y-4">
          <div className="rounded-large border border-ink-hairline bg-paper-surface p-4">
            <h3 className="font-display text-lg font-medium text-ink">Join</h3>
            {!customerEmail ? (
              <>
                <p className="mt-1 text-xs text-ink-muted">
                  Sign in to your account to join this mall in one click.
                </p>
                <LocalizedClientLink
                  href="/account"
                  className="mt-3 block w-full rounded-medium bg-ink px-3 py-2 text-center text-sm font-medium text-white hover:bg-ink/90"
                >
                  Sign in to join
                </LocalizedClientLink>
              </>
            ) : alreadyJoined ? (
              <p className="mt-2 text-sm text-ink-muted">
                You&apos;re a member of this mall. Every purchase counts toward the
                prize draws.
              </p>
            ) : (
              <>
                <p className="mt-1 text-xs text-ink-muted">
                  Joining as <span className="font-medium text-ink">{customerEmail}</span>.
                  One click — no extra details needed.
                </p>
                <button
                  type="button"
                  disabled={isPending}
                  onClick={join}
                  className="mt-3 w-full rounded-medium bg-ink px-3 py-2 text-sm font-medium text-white hover:bg-ink/90 disabled:opacity-50"
                >
                  {isPending ? "Joining…" : "Join this mall"}
                </button>
              </>
            )}
          </div>

          {mall.status === "active" && (
            <div className="rounded-large border border-ink-hairline bg-paper-surface p-4">
              <h3 className="font-display text-lg font-medium text-ink">
                Record a purchase
              </h3>
              <p className="mt-1 text-xs text-ink-muted">
                After checkout, enter your order id here to enter the prize draw.
              </p>
              <input
                type="text"
                value={orderId}
                onChange={(e) => setOrderId(e.target.value)}
                placeholder="Order id"
                className="mt-3 w-full rounded-medium border border-ink-hairline px-3 py-2 text-sm text-ink outline-none focus:border-ink"
              />
              <button
                type="button"
                disabled={isPending || !customerEmail}
                onClick={purchase}
                className="mt-2 w-full rounded-medium border border-ink-strong px-3 py-2 text-sm font-medium text-ink hover:bg-ink hover:text-white disabled:opacity-50"
              >
                {isPending ? "Recording…" : "Record purchase"}
              </button>
            </div>
          )}

          {prizes.length > 0 && (
            <div className="rounded-large border border-ink-hairline bg-paper-surface p-4">
              <h3 className="font-display text-lg font-medium text-ink">
                Prize winners
              </h3>
              <ul className="mt-2 divide-y divide-ink-hairline">
                {prizes.map((p: any) => (
                  <li
                    key={p.id}
                    className="flex items-center justify-between py-2 text-sm"
                  >
                    <span className="truncate text-ink-muted">
                      {p.winner_buyer_email}
                    </span>
                    <span className="ml-2 font-mono tabular-nums text-ink">
                      {ngn(p.amount_ngn)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {message && <p className="text-sm text-ink-muted">{message}</p>}
        </div>
      </div>
    </div>
  )
}

export default MallDetailClient

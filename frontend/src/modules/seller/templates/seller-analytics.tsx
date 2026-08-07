"use client"

import { useMemo, useState } from "react"
import { clx } from "@medusajs/ui"

const money = (amount: number | string, currency: string) =>
  new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: (currency || "NGN").toUpperCase(),
    // Backend amounts are minor units (kobo) — divide to major for display.
  }).format(Number(amount ?? 0) / 100)

type Series = "daily" | "weekly" | "monthly"

type Bucket = { label: string; gross: number; net: number; orders: number }

type AnalyticsData = {
  overview?: Record<
    string,
    { gross: number; commission: number; net: number; orders: number }
  >
  series?: { daily: Bucket[]; weekly: Bucket[]; monthly: Bucket[] }
  products?: {
    product_id: string
    title: string
    thumbnail?: string | null
    status?: string
    units: number
    revenue: number
    last_sold?: string | null
  }[]
  journal?: {
    id: string
    order_id?: string
    currency_code?: string
    gross: number
    commission: number
    net: number
    status?: string
    created_at?: string
  }[]
}

const STATUS_LABEL: Record<string, string> = {
  pending: "Pending",
  available: "Available",
  reserved: "In escrow",
  paid: "Paid out",
  reversed: "Reversed",
}

const TrendChart = ({ buckets, currency }: { buckets: Bucket[]; currency: string }) => {
  const max = Math.max(...buckets.map((b) => b.gross), 1)
  return (
    <div className="space-y-2">
      {buckets.map((b) => (
        <div key={b.label} className="flex items-center gap-3">
          <span className="w-24 shrink-0 text-xs text-ink-muted tabular-nums">
            {b.label}
          </span>
          <div className="flex-1">
            <div className="h-6 rounded bg-ink/10 overflow-hidden">
              <div
                className="h-full bg-ink/70"
                style={{ width: `${Math.max((b.gross / max) * 100, b.gross > 0 ? 2 : 0)}%` }}
              />
            </div>
          </div>
          <span className="w-24 shrink-0 text-right text-xs text-ink tabular-nums">
            {money(b.gross, currency)}
          </span>
          <span className="w-12 shrink-0 text-right text-xs text-ink-muted tabular-nums">
            {b.orders} order{b.orders === 1 ? "" : "s"}
          </span>
        </div>
      ))}
    </div>
  )
}

const SellerAnalytics = ({
  seller,
  analytics,
}: {
  seller: any
  analytics: AnalyticsData | null
}) => {
  const [series, setSeries] = useState<Series>("daily")

  const overview = useMemo(() => {
    if (!analytics?.overview) return null
    const entries = Object.entries(analytics.overview)
    if (!entries.length) return null
    entries.sort((a, b) => Number(b[1].gross) - Number(a[1].gross))
    return entries.map(([cc, v]) => ({ currency: cc, ...v }))
  }, [analytics])

  const displayCurrency = overview?.[0]?.currency ?? "ngn"
  const buckets = analytics?.series?.[series] ?? []

  const products = analytics?.products ?? []
  const topProducts = products
    .filter((p) => p.units > 0)
    .slice(0, 5)
  const notSelling = products.filter((p) => p.units === 0).slice(0, 5)
  const journal = analytics?.journal ?? []

  const totals = overview?.[0]

  return (
    <div data-testid="seller-analytics-page">
      <h2 className="font-display text-2xl font-medium tracking-[-0.02em] text-ink mb-6">
        Analytics
      </h2>

      {!analytics ? (
        <div className="text-center py-16 border border-dashed rounded-large">
          <p className="text-ink-muted">Analytics are not available right now.</p>
        </div>
      ) : (
        <div className="space-y-8">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="border border-ink-hairline rounded-large p-4 bg-paper-surface">
              <p className="text-sm text-ink-muted">Gross sales</p>
              <p className="text-xl font-medium text-ink mt-1 tabular-nums">
                {totals ? money(totals.gross, totals.currency) : money(0, displayCurrency)}
              </p>
            </div>
            <div className="border border-ink-hairline rounded-large p-4 bg-paper-surface">
              <p className="text-sm text-ink-muted">Net earnings</p>
              <p className="text-xl font-medium text-ink mt-1 tabular-nums">
                {totals ? money(totals.net, totals.currency) : money(0, displayCurrency)}
              </p>
            </div>
            <div className="border border-ink-hairline rounded-large p-4 bg-paper-surface">
              <p className="text-sm text-ink-muted">Orders</p>
              <p className="text-xl font-medium text-ink mt-1 tabular-nums">
                {totals?.orders ?? 0}
              </p>
            </div>
            <div className="border border-ink-hairline rounded-large p-4 bg-paper-surface">
              <p className="text-sm text-ink-muted">Commission</p>
              <p className="text-xl font-medium text-ink mt-1 tabular-nums">
                {totals ? money(totals.commission, totals.currency) : money(0, displayCurrency)}
              </p>
            </div>
          </div>

          <section className="border border-ink-hairline rounded-large p-5 bg-paper-surface">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base-semi text-ink">Sales over time</h3>
              <div className="flex gap-1">
                {(["daily", "weekly", "monthly"] as Series[]).map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setSeries(s)}
                    className={clx(
                      "px-3 py-1 text-sm rounded-full capitalize",
                      series === s
                        ? "bg-ink text-white"
                        : "text-ink-muted hover:text-ink"
                    )}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
            {buckets.length === 0 || buckets.every((b) => b.gross === 0) ? (
              <p className="text-sm text-ink-muted py-6 text-center">
                No sales in this period yet.
              </p>
            ) : (
              <TrendChart buckets={buckets} currency={displayCurrency} />
            )}
          </section>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <section className="border border-ink-hairline rounded-large p-5 bg-paper-surface">
              <h3 className="text-base-semi text-ink mb-4">Top sellers</h3>
              {topProducts.length === 0 ? (
                <p className="text-sm text-ink-muted">
                  You have no recorded sales yet.
                </p>
              ) : (
                <ul className="space-y-3">
                  {topProducts.map((p, i) => (
                    <li key={p.product_id} className="flex items-center gap-3">
                      <span className="text-sm text-ink-muted w-4 shrink-0">
                        {i + 1}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-ink truncate">{p.title}</p>
                        <p className="text-xs text-ink-muted">
                          {p.units} sold
                        </p>
                      </div>
                      <span className="text-sm text-ink tabular-nums">
                        {money(p.revenue, displayCurrency)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="border border-ink-hairline rounded-large p-5 bg-paper-surface">
              <h3 className="text-base-semi text-ink mb-4">Not selling</h3>
              {notSelling.length === 0 ? (
                <p className="text-sm text-ink-muted">
                  Everything in your catalog is moving.
                </p>
              ) : (
                <ul className="space-y-3">
                  {notSelling.map((p) => (
                    <li key={p.product_id} className="flex items-center gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-ink truncate">{p.title}</p>
                        <p className="text-xs text-ink-muted">
                          {p.status === "published" ? "Live, 0 sold" : "Draft"}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>

          <section className="border border-ink-hairline rounded-large overflow-hidden bg-paper-surface">
            <h3 className="text-base-semi text-ink px-5 pt-5 pb-3">Sales journal</h3>
            {journal.length === 0 ? (
              <p className="text-sm text-ink-muted px-5 pb-5">
                No sales yet. When an order settles, its line shows up here.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-ink-muted border-t border-ink-hairline">
                      <th className="px-5 py-2 font-normal">Order</th>
                      <th className="px-5 py-2 font-normal">Date</th>
                      <th className="px-5 py-2 font-normal text-right">Gross</th>
                      <th className="px-5 py-2 font-normal text-right">Commission</th>
                      <th className="px-5 py-2 font-normal text-right">Net</th>
                      <th className="px-5 py-2 font-normal">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-ink-hairline">
                    {journal.map((l) => (
                      <tr key={l.id}>
                        <td className="px-5 py-2 text-ink tabular-nums">
                          {l.order_id ? l.order_id.slice(-8) : "—"}
                        </td>
                        <td className="px-5 py-2 text-ink-muted">
                          {l.created_at
                            ? new Date(l.created_at).toLocaleDateString("en-NG")
                            : "—"}
                        </td>
                        <td className="px-5 py-2 text-right tabular-nums">
                          {money(l.gross, l.currency_code ?? displayCurrency)}
                        </td>
                        <td className="px-5 py-2 text-right tabular-nums">
                          {money(l.commission, l.currency_code ?? displayCurrency)}
                        </td>
                        <td className="px-5 py-2 text-right tabular-nums">
                          {money(l.net, l.currency_code ?? displayCurrency)}
                        </td>
                        <td className="px-5 py-2">
                          {STATUS_LABEL[l.status ?? ""] ?? l.status ?? "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  )
}

export default SellerAnalytics
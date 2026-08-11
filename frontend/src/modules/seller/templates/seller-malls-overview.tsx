"use client"

import { useState } from "react"
import LocalizedClientLink from "@modules/common/components/localized-client-link"
import { cancelMall, relaunchMall, type Mall } from "@lib/data/mall"
import type { SellerProduct } from "@lib/data/seller"
import { CreateMallForm } from "@modules/mall/components/seller-mall-tools"

const ngn = (value: number | string | undefined) =>
  new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN", maximumFractionDigits: 0 }).format(Number(value ?? 0))

const LifecycleActions = ({ mall, sellerId, onDone }: { mall: Mall; sellerId: string | null; onDone: () => void }) => {
  const [message, setMessage] = useState<string | null>(null)
  if (!sellerId || mall.created_by_seller_id !== sellerId || !["pending", "expired"].includes(mall.status)) return null

  const cancel = async () => {
    if (!window.confirm(`Cancel “${mall.name}”? Remaining contributions will be refunded.`)) return
    const result = await cancelMall(mall.id)
    setMessage(result.success ? "Mall cancelled and refunds queued." : result.error)
    if (result.success) onDone()
  }

  const relaunch = async () => {
    const result = await relaunchMall(mall.id)
    setMessage(result.success ? "Mall re-launched." : result.error)
    if (result.success) onDone()
  }

  return (
    <div className="flex items-center gap-2">
      {mall.status === "expired" && <button type="button" onClick={relaunch} className="rounded-medium bg-ink px-3 py-1.5 text-xs font-medium text-white">Re-launch</button>}
      <button type="button" onClick={cancel} className="rounded-medium border border-ink-strong px-3 py-1.5 text-xs font-medium text-ink">Cancel</button>
      {message && <span className="text-xs text-ink-muted">{message}</span>}
    </div>
  )
}

const SellerMallsOverview = ({
  malls,
  products,
  sellerId,
  availableBalanceNgn,
}: {
  malls: Mall[]
  products: SellerProduct[]
  sellerId: string | null
  availableBalanceNgn?: number | null
}) => {
  const reload = () => window.location.reload()
  return (
    <div data-testid="seller-malls-page" className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-brand">Manage Business</p>
          <h2 className="mt-2 font-display text-2xl font-medium tracking-[-0.02em] text-ink">Malls</h2>
        </div>
        <LocalizedClientLink href="/malls/create" className="rounded-control bg-ink px-4 py-2 text-sm font-medium text-white">Create a mall</LocalizedClientLink>
      </div>

      <div className="rounded-large border border-brand/20 bg-brand/5 p-5">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-brand">Join from the mall page</p>
        <p className="mt-2 max-w-2xl text-sm text-ink-muted">Browse available malls, open one you like, then join as a buyer or as a store. Store participation starts with your contribution and the products you want to feature.</p>
        <LocalizedClientLink href="/malls" className="mt-4 inline-flex rounded-control border border-ink-strong px-4 py-2 text-sm font-medium text-ink">Browse malls</LocalizedClientLink>
      </div>

      <CreateMallForm products={products} availableBalanceNgn={availableBalanceNgn} onDone={reload} />

      <div className="rounded-large border border-ink-hairline bg-paper-surface p-5">
        <h3 className="font-display text-lg font-medium text-ink">Your mall activity</h3>
        {!malls.length ? (
          <p className="mt-3 text-sm text-ink-muted">You have not created or joined a mall yet.</p>
        ) : (
          <ul className="mt-3 divide-y divide-ink-hairline">
            {malls.map((mall) => (
              <li key={mall.id} className="flex flex-col gap-3 py-4 small:flex-row small:items-center small:justify-between">
                <div>
                  <LocalizedClientLink href={`/malls/${mall.id}`} className="font-medium text-ink hover:underline">{mall.name}</LocalizedClientLink>
                  <p className="mt-1 text-xs text-ink-muted">
                    {mall.status === "active" ? "Live for shopping" : mall.status === "pending" ? "Gathering sellers and buyers" : mall.status} · {ngn(mall.prize_pool_ngn)} pool
                  </p>
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

export default SellerMallsOverview

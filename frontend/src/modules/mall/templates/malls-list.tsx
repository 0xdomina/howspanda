"use client"

import { useMemo, useState, useTransition } from "react"
import LocalizedClientLink from "@modules/common/components/localized-client-link"
import { joinMallAsBuyer, type Mall, type MallWin } from "@lib/data/mall"
import { JoinMallForm } from "@modules/mall/components/seller-mall-tools"
import type { SellerAdmin, SellerProduct } from "@lib/data/seller"
import { sellerHasPermission } from "@lib/seller-permissions"

const ngn = (value: number | string | undefined) => new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN", maximumFractionDigits: 0 }).format(Number(value ?? 0))
const maskEmail = (email: string) => email.replace(/^(.).+(@.*)$/, "$1•••$2")

const WinTicker = ({ wins }: { wins: MallWin[] }) => wins.length ? (
  <div className="mb-8 rounded-control border border-ink-hairline bg-white px-4 py-3"><p className="text-xs font-medium uppercase tracking-wide text-ink-muted">Recent wins</p><ul className="mt-2 flex flex-col gap-1.5">{wins.map((win) => <li key={win.id} className="flex items-center justify-between gap-3 text-sm"><span className="truncate text-ink-muted"><span className="text-ink">{maskEmail(win.winner_buyer_email)}</span> won in <LocalizedClientLink href={`/malls/${win.mall_id}`} className="hover:underline">{win.mall_name}</LocalizedClientLink></span><span className="shrink-0 font-mono tabular-nums text-emerald-700">+{ngn(win.amount_ngn)}</span></li>)}</ul></div>
) : null

const MallCard = ({ mall, customerEmail, rank }: { mall: Mall; customerEmail: string | null; rank: number }) => {
  const [message, setMessage] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const join = () => {
    if (!customerEmail) { setMessage("Sign in to join this mall."); return }
    startTransition(async () => { const result = await joinMallAsBuyer(mall.id, customerEmail); setMessage(result.success ? "You are in. Your purchases will count automatically." : result.error) })
  }
  const pending = mall.status === "pending"
  return <article className="figma-surface flex flex-col p-5"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><LocalizedClientLink href={`/malls/${mall.id}`}><h2 className="font-display text-lg font-medium text-ink hover:underline">{mall.name}</h2></LocalizedClientLink><span className="text-xs text-ink-muted">Rank #{rank}</span>{rank === 1 && <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800">Top mall</span>}</div><p className="mt-1 line-clamp-2 text-sm text-ink-muted">{mall.description || "A community shopping event."}</p></div><span className={`shrink-0 rounded-full px-2 py-0.5 text-xs ${pending ? "bg-amber-50 text-amber-800" : "bg-emerald-50 text-emerald-700"}`}>{pending ? "Pending launch" : "Shopping open"}</span></div><div className="mt-4 grid grid-cols-3 gap-2 text-center"><div className="rounded-medium bg-ink/5 px-2 py-2"><p className="text-xs text-ink-muted">Pool</p><p className="mt-0.5 font-mono text-sm text-ink">{ngn(mall.prize_pool_ngn)}</p></div><div className="rounded-medium bg-ink/5 px-2 py-2"><p className="text-xs text-ink-muted">Paid</p><p className="mt-0.5 font-mono text-sm text-ink">{ngn(mall.paid_out_ngn)}</p></div><div className="rounded-medium bg-ink/5 px-2 py-2"><p className="text-xs text-ink-muted">Community</p><p className="mt-0.5 font-mono text-sm text-ink">{mall.seller_count ?? 0}/{mall.target_sellers} sellers</p></div></div>{pending && <p className="mt-3 text-xs text-amber-700">{mall.buyer_count ?? 0}/{mall.target_buyers} buyers joined. Products are visible, but checkout is locked until launch.</p>}{(pending || mall.status === "active") && <div className="mt-4">{customerEmail ? <button type="button" disabled={isPending} onClick={join} className="w-full rounded-control bg-ink px-3 py-3 text-sm font-medium text-white disabled:opacity-50">{isPending ? "Joining…" : "Join this mall"}</button> : <LocalizedClientLink href="/account" className="block w-full rounded-control border border-ink-strong px-3 py-3 text-center text-sm font-medium text-ink">Sign in to join</LocalizedClientLink>}{message && <p className="mt-2 text-xs text-ink-muted">{message}</p>}</div>}</article>
}

const MallsClient = ({ malls, wins = [], customerEmail, seller = null, sellerProducts = [], sellerBalanceNgn = null }: { malls: Mall[]; wins?: MallWin[]; customerEmail: string | null; seller?: SellerAdmin | null; sellerProducts?: SellerProduct[]; sellerBalanceNgn?: number | null }) => {
  const rankedMalls = useMemo(() => [...malls].sort((a, b) => Number(b.prize_pool_ngn) - Number(a.prize_pool_ngn)), [malls])
  const hasSellerTools = !!seller && sellerHasPermission(seller, "malls")
  return <div data-testid="malls-page" className="figma-container flex-1 py-10 small:py-16"><div className="mb-8 max-w-2xl"><h1 className="font-display text-3xl font-medium tracking-[-0.02em] text-ink">Malls</h1><p className="mt-2 max-w-xl text-sm text-ink-muted">Community shopping events. Join early, browse featured products, and shop when a mall reaches its launch target.</p></div>{hasSellerTools && <section className="mb-8 rounded-large border border-ink-hairline bg-paper-surface p-5"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-display text-xl font-medium text-ink">For your store</h2><p className="mt-1 text-sm text-ink-muted">Create a mall or join one that is still gathering sellers.</p></div><LocalizedClientLink href="/malls/create" className="rounded-control bg-ink px-4 py-2 text-sm font-medium text-white">Create a mall</LocalizedClientLink></div><div className="mt-5"><JoinMallForm malls={rankedMalls} products={sellerProducts} availableBalanceNgn={sellerBalanceNgn} onDone={() => window.location.reload()} /></div></section>}<WinTicker wins={wins} />{!rankedMalls.length ? <div className="rounded-control border border-dashed border-ink-hairline bg-white py-16 text-center"><p className="text-ink-muted">No malls are gathering or live right now.</p><p className="mt-1 text-sm text-ink-muted">Check back soon for the next community event.</p></div> : <div className="grid grid-cols-1 gap-4 small:grid-cols-2">{rankedMalls.map((mall, index) => <MallCard key={mall.id} mall={mall} customerEmail={customerEmail} rank={index + 1} />)}</div>}</div>
}

export default MallsClient

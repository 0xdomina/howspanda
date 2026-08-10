"use client"

import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import LocalizedClientLink from "@modules/common/components/localized-client-link"
import ShareButton from "@modules/common/components/share-button"
import { useShareUrl } from "@lib/hooks/use-share-url"
import { joinMallAsBuyer } from "@lib/data/mall"

const ngn = (value: number | string | undefined) =>
  new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN", maximumFractionDigits: 0 }).format(Number(value ?? 0))

const statusLabel: Record<string, string> = {
  pending: "Gathering community",
  active: "Shopping open",
  settling: "Settling prizes",
  expired: "Expired",
  cancelled: "Cancelled",
  closed: "Closed",
}

const maskedEmail = (email: string) => email.replace(/^(.).+(@.*)$/, "$1•••$2")

const GoodCard = ({ good, mallId, canShop }: { good: any; mallId: string; canShop: boolean }) => {
  const price = good.variants?.length
    ? Math.min(...good.variants.map((variant: any) => variant.prices?.[0]?.amount ?? Infinity).filter(Number.isFinite))
    : null
  const content = (
    <>
      <div className="aspect-square overflow-hidden rounded-medium bg-ink/5">
        {good.thumbnail ? <img src={good.thumbnail} alt={good.title} className="h-full w-full object-cover" /> : <div className="flex h-full items-center justify-center text-3xl text-ink/20">{good.title?.[0]?.toUpperCase() ?? "?"}</div>}
      </div>
      <p className="mt-2 truncate text-sm text-ink">{good.title}</p>
      {price != null && price !== Infinity && <p className="mt-0.5 font-mono tabular-nums text-sm text-ink">{ngn(price / 100)}</p>}
      {good.seller_name && <p className="mt-1 truncate text-[11px] text-ink-muted">{good.seller_name}</p>}
      {!canShop && <p className="mt-2 text-[11px] font-medium text-amber-700">Shopping opens when the mall is live</p>}
    </>
  )
  return canShop && good.handle ? <LocalizedClientLink href={`/products/${good.handle}?mall_id=${encodeURIComponent(mallId)}`} className="figma-surface group p-3 transition hover:border-ink">{content}</LocalizedClientLink> : <div className="figma-surface p-3">{content}</div>
}

const MallDetailClient = ({ mall, goods = [], customerEmail }: { mall: any; detail?: any; goods?: any[]; customerEmail?: string | null }) => {
  const router = useRouter()
  const sellers = mall?.sellers ?? []
  const buyers = mall?.buyers ?? []
  const prizes = mall?.prizes ?? []
  const shoppingOpen = mall.status === "active"
  const sellerCount = Number(mall.seller_count ?? sellers.length)
  const buyerCount = Number(mall.buyer_count ?? buyers.length)
  const paidOut = Number(mall.paid_out_ngn ?? prizes.filter((p: any) => p.claimed || p.wallet_ledger_id).reduce((sum: number, p: any) => sum + Number(p.amount_ngn ?? 0), 0))
  const alreadyJoined = customerEmail ? buyers.some((buyer: any) => buyer.buyer_email === customerEmail) : false
  const [joinMessage, setJoinMessage] = useState<string | null>(null)
  const [isJoining, startJoining] = useTransition()
  const shareUrl = useShareUrl()
  const join = () => {
    if (!customerEmail) return
    startJoining(async () => {
      const result = await joinMallAsBuyer(mall.id, customerEmail)
      if (result.success) {
        setJoinMessage("You are in. Your purchases will count automatically.")
        router.refresh()
      } else {
        setJoinMessage(result.error)
      }
    })
  }

  return (
    <div data-testid="mall-detail-page" className="figma-container flex-1 py-10 small:py-16">
      <div className="mb-6"><LocalizedClientLink href="/malls" className="text-sm text-ink-muted hover:text-ink">← All malls</LocalizedClientLink></div>
      <div className="flex flex-col gap-8 small:flex-row small:items-start">
        <main className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="font-display text-3xl font-medium tracking-[-0.02em] text-ink">{mall.name}</h1>
            <span className="rounded-full bg-ink/10 px-2 py-0.5 text-xs text-ink">{statusLabel[mall.status] ?? mall.status}</span>
            <ShareButton
              entity="mall"
              entityId={mall.id}
              payload={{
                url: shareUrl(`/malls/${mall.id}`),
                text: `${mall.name} on How's u — a community sales event.`,
                title: mall.name,
              }}
            />
          </div>
          <p className="mt-2 text-sm text-ink-muted">{mall.description || "A community shopping event."}</p>

          {!shoppingOpen && mall.status === "pending" && <div className="mt-4 rounded-large border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"><p className="font-medium">This mall is not open for shopping yet.</p><p className="mt-1">Browse the featured products and join the community. Shopping opens after {mall.target_sellers} sellers and {mall.target_buyers} buyers join.</p></div>}

          <div className="mt-6 grid grid-cols-2 gap-3 small:grid-cols-5">
            {[["Prize pool", ngn(mall.prize_pool_ngn)], ["Contributed", ngn(mall.contributed_ngn)], ["Paid out", ngn(paidOut)], ["Remaining", ngn(mall.remaining_ngn)], ["Ends", new Date(mall.expires_at).toLocaleDateString()]].map(([label, value]) => <div key={label} className="rounded-medium border border-ink-hairline bg-paper-surface p-3"><p className="text-xs text-ink-muted">{label}</p><p className="mt-1 font-mono tabular-nums text-sm text-ink">{value}</p></div>)}
          </div>

          <div className="mt-4 rounded-large border border-ink-hairline bg-paper-surface p-4">
            <div className="flex flex-wrap items-center justify-between gap-2 text-sm"><span className="text-ink-muted">Community progress</span><span className="font-medium text-ink">{sellerCount}/{mall.target_sellers} sellers · {buyerCount}/{mall.target_buyers} buyers</span></div>
            <div className="mt-3 grid gap-2"><div className="h-2 overflow-hidden rounded-full bg-ink/10"><div className="h-full rounded-full bg-ink" style={{ width: `${Math.min(100, sellerCount / Math.max(1, Number(mall.target_sellers)) * 100)}%` }} /></div><div className="h-2 overflow-hidden rounded-full bg-ink/10"><div className="h-full rounded-full bg-brand" style={{ width: `${Math.min(100, buyerCount / Math.max(1, Number(mall.target_buyers)) * 100)}%` }} /></div></div>
          </div>

          <section className="mt-8">
            <h2 className="font-display text-xl font-medium text-ink">Featured products</h2>
            <p className="mt-1 text-sm text-ink-muted">Products selected by participating stores. {shoppingOpen ? "Orders are counted automatically for the mall draw." : "Products are visible while the community gathers, but checkout opens when the mall goes live."}</p>
            {goods.length ? <div className="mt-4 grid grid-cols-2 gap-3 small:grid-cols-4">{goods.map((good) => <GoodCard key={good.id} good={good} mallId={mall.id} canShop={shoppingOpen} />)}</div> : <p className="mt-4 rounded-large border border-dashed border-ink-hairline p-8 text-center text-sm text-ink-muted">Participating stores are still adding products.</p>}
          </section>

          <section className="mt-8 rounded-large border border-ink-hairline bg-paper-surface p-5">
            <h2 className="font-display text-xl font-medium text-ink">Participating stores</h2>
            {sellers.length ? <ul className="mt-3 divide-y divide-ink-hairline">{sellers.map((seller: any) => <li key={seller.id} className="flex items-center justify-between gap-3 py-3 text-sm"><span className="text-ink">Store participating</span><span className="font-mono tabular-nums text-ink-muted">{ngn(seller.contribution_ngn)} contributed</span></li>)}</ul> : <p className="mt-3 text-sm text-ink-muted">No stores have joined yet.</p>}
          </section>
        </main>

        <aside className="w-full space-y-4 small:max-w-sm">
          <section className="rounded-large border border-ink-hairline bg-paper-surface p-5">
            <h2 className="font-display text-lg font-medium text-ink">Join the mall</h2>
            {!customerEmail ? <><p className="mt-1 text-sm text-ink-muted">Sign in to join and have your purchases count toward the draw.</p><LocalizedClientLink href="/account" className="mt-3 block rounded-control bg-ink px-3 py-2 text-center text-sm font-medium text-white">Sign in to join</LocalizedClientLink></> : alreadyJoined ? <p className="mt-2 text-sm text-emerald-700">You are in. {shoppingOpen ? "Your purchases count automatically." : "You are helping this mall reach its launch target."}</p> : <><p className="mt-1 text-sm text-ink-muted">Join with your How&apos;s U account. No second account is needed.</p><button type="button" disabled={isJoining} onClick={join} className="mt-3 w-full rounded-control bg-ink px-3 py-2 text-sm font-medium text-white disabled:opacity-50">{isJoining ? "Joining…" : "Join this mall"}</button></>}
            {joinMessage && <p className="mt-2 text-xs text-ink-muted">{joinMessage}</p>}
          </section>

          <section className="rounded-large border border-ink-hairline bg-paper-surface p-5"><h2 className="font-display text-lg font-medium text-ink">Prize winners</h2>{prizes.length ? <ul className="mt-3 divide-y divide-ink-hairline">{prizes.map((prize: any) => <li key={prize.id} className="flex items-center justify-between gap-2 py-2 text-sm"><span className="truncate text-ink-muted">{maskedEmail(prize.winner_buyer_email)}</span><span className="font-mono tabular-nums text-ink">{ngn(prize.amount_ngn)}</span><span className="text-xs text-emerald-700">{prize.claimed ? "Paid" : "Pending"}</span></li>)}</ul> : <p className="mt-2 text-sm text-ink-muted">Winners will appear here as prizes are drawn.</p>}</section>
        </aside>
      </div>
    </div>
  )
}

export default MallDetailClient

import { Metadata } from "next"
import { notFound } from "next/navigation"

import {
  retrieveSeller,
  listSellerProducts,
  retrieveSellerBalance,
  retrieveSellerTrustScore,
  listPayoutAccounts,
  listSellerOrders,
} from "@lib/data/seller"
import Button from "@modules/common/components/button"
import LocalizedClientLink from "@modules/common/components/localized-client-link"
import { convertToLocale } from "@lib/util/money"
import { sellerHasPermission } from "@lib/seller-permissions"

const tierStyles: Record<string, string> = {
  "Top Store": "bg-emerald-600/10 text-emerald-700",
  Trusted: "bg-emerald-600/10 text-emerald-700",
  Reliable: "bg-sky-600/10 text-sky-700",
  Rising: "bg-amber-600/10 text-amber-700",
  Building: "bg-rose-600/10 text-rose-700",
  New: "bg-ink/5 text-ink-muted",
}

const TrustScoreCard = async () => {
  const trust = await retrieveSellerTrustScore().catch(() => null)

  return (
    <div className="figma-surface p-5">
      <div className="flex items-center justify-between">
        <p className="text-sm text-ink-muted">Trust score</p>
        {trust && (
          <span
            className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
              tierStyles[trust.tier] ?? tierStyles["New"]
            }`}
          >
            {trust.tier}
          </span>
        )}
      </div>

      {!trust ? (
        <p className="mt-2 text-sm text-ink-muted">
          Keep selling — your store earns a trust score once it completes a few
          orders.
        </p>
      ) : (
        <>
          <p className="mt-1 font-mono tabular-nums text-2xl text-ink">
            {trust.score ?? "—"}
            <span className="text-sm text-ink-muted"> / 100</span>
          </p>
          {trust.review_count > 0 && (
            <p className="mt-1 text-xs text-ink-muted">
              {trust.avg_rating != null ? `${trust.avg_rating.toFixed(1)}★` : ""} from {trust.review_count} review
              {trust.review_count === 1 ? "" : "s"}
            </p>
          )}
          {trust.breakdown && trust.breakdown.length > 0 && (
            <div className="mt-3 space-y-2">
              {trust.breakdown.map((b) => (
                <div key={b.key}>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-ink-muted">
                      {b.key.replace(/_/g, " ")}
                    </span>
                    <span className="text-ink">{b.value}</span>
                  </div>
                  <div className="mt-0.5 h-1.5 rounded-full bg-ink/5">
                    <div
                      className="h-1.5 rounded-full bg-ink"
                      style={{ width: `${b.value}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}

export const metadata: Metadata = {
  title: "Store overview",
  description: "Overview of your store activity.",
}

export default async function SellerDashboardPage() {
  const seller = await retrieveSeller().catch(() => null)
  const products = (await listSellerProducts().catch(() => [])) || []
  const balance = (await retrieveSellerBalance().catch(() => null)) as any
  const payoutAccounts = (await listPayoutAccounts().catch(() => [])) || []
  const orders = (await listSellerOrders().catch(() => [])) || []

  if (!seller) {
    notFound()
  }

  const checklist = [
    {
      done: payoutAccounts.length > 0,
      title: "Add a payout account",
      body: "Bank or crypto — this is where your sales land.",
      href: "/seller/money",
      cta: "Set up payouts",
    },
    {
      done: products.length > 0,
      title: "List your first product",
      body: "A photo, a price, a short description — you're live.",
      href: "/seller/products/new",
      cta: "Add a product",
    },
    {
      done: orders.length > 0,
      title: "Get your first order",
      body: "Share your store link to bring your first buyers.",
      href: "/seller/orders",
      cta: "View orders",
    },
  ]
  const doneCount = checklist.filter((c) => c.done).length

  const ngn = balance?.balances?.ngn
  const available = Number(ngn?.available ?? 0)
  const canViewMoney = seller.role !== "staff"
  const canViewProducts = sellerHasPermission(seller, "products")
  const canViewAi = sellerHasPermission(seller, "ai")

  return (
    <div data-testid="seller-dashboard-page">
      {doneCount < checklist.length && (
        <div className="figma-surface mb-8 p-5" data-testid="seller-checklist">
          <div className="flex items-baseline justify-between gap-4">
            <h2 className="font-display text-xl font-medium text-ink">
              Get your store ready
            </h2>
            <span className="text-xs font-medium text-ink-muted">
              {doneCount} of {checklist.length} done
            </span>
          </div>
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-ink/5">
            <div
              className="h-full rounded-full bg-emerald-600 transition-[width] duration-300"
              style={{ width: `${(doneCount / checklist.length) * 100}%` }}
              role="progressbar"
              aria-valuenow={doneCount}
              aria-valuemin={0}
              aria-valuemax={checklist.length}
              aria-label="Store setup progress"
            />
          </div>
          <ul className="mt-4 flex flex-col gap-y-3">
            {checklist.map((item) => (
              <li
                key={item.title}
                className="flex items-center justify-between gap-3"
              >
                <div className="flex min-w-0 items-start gap-2.5">
                  <span
                    className={
                      "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold " +
                      (item.done
                        ? "bg-emerald-600 text-white"
                        : "bg-ink/10 text-ink-muted")
                    }
                    aria-label={item.done ? "Done" : "To do"}
                  >
                    {item.done ? "✓" : "·"}
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-ink">{item.title}</p>
                    <p className="text-xs text-ink-muted">{item.body}</p>
                  </div>
                </div>
                {!item.done && (
                  <Button asChild size="small" className="shrink-0">
                    <LocalizedClientLink href={item.href}>
                      {item.cta}
                    </LocalizedClientLink>
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="mb-8 grid grid-cols-1 gap-4 small:grid-cols-2">
        {canViewMoney && <div className="figma-surface p-5">
          <p className="text-sm text-ink-muted">Available balance</p>
          <p className="mt-1 font-mono tabular-nums text-2xl text-ink">
            {convertToLocale({ amount: available, currency_code: "ngn" })}
          </p>
        </div>}
        {canViewProducts && <div className="figma-surface p-5">
          <p className="text-sm text-ink-muted">Products</p>
          <p className="mt-1 font-mono tabular-nums text-2xl text-ink">
            {products.length}
          </p>
        </div>}
        <TrustScoreCard />
        <div className="figma-surface p-5">
          <p className="text-sm text-ink-muted">Best next step</p>
          <p className="mt-1 text-sm text-ink">
            Deliver orders quickly and reply to reviews to grow your trust score.
          </p>
        </div>
      </div>

      {canViewAi && (
        <div className="mb-8 flex flex-col gap-4 figma-surface p-5 small:flex-row small:items-center small:justify-between">
          <div>
            <p className="text-sm font-semibold text-ink">Seller AI</p>
            <p className="mt-1 text-sm text-ink-muted">Get help with listings, pricing, marketing, and store insights.</p>
          </div>
          <Button asChild>
            <LocalizedClientLink href="/seller/ai">Open Seller AI</LocalizedClientLink>
          </Button>
        </div>
      )}

      {products.length === 0 && (
        <div className="flex flex-col gap-4">
          <div className="figma-surface p-5">
            <h3 className="font-display text-xl font-medium text-ink mb-2">
              Add your first product
            </h3>
            <p className="text-sm text-ink-muted mb-4">
              List what you make with a photo and price. It appears in your store
              right away.
            </p>
            <Button asChild>
              <LocalizedClientLink href="/seller/products/new">
                Add a product
              </LocalizedClientLink>
            </Button>
          </div>
        </div>
      )}
      {products.length > 0 && (
        <div className="flex flex-col gap-4">
          <div className="figma-surface p-5">
            <h3 className="font-display text-xl font-medium text-ink mb-2">
              Next steps
            </h3>
            <p className="text-sm text-ink-muted mb-4">
              Deliver orders quickly and reply to reviews to grow your trust score.
            </p>
            <Button asChild>
              <LocalizedClientLink href="/seller/products/new">
                Add another product
              </LocalizedClientLink>
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

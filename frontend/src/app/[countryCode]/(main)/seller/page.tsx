import { Metadata } from "next"
import { notFound } from "next/navigation"

import {
  retrieveSeller,
  listSellerProducts,
  retrieveSellerBalance,
  retrieveSellerTrustScore,
} from "@lib/data/seller"
import Button from "@modules/common/components/button"
import LocalizedClientLink from "@modules/common/components/localized-client-link"
import { convertToLocale } from "@lib/util/money"

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
    <div className="p-5 border border-ink-hairline rounded-large bg-paper-surface">
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
              {trust.avg_rating.toFixed(1)}★ from {trust.review_count} review
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

  if (!seller) {
    notFound()
  }

  const ngn = balance?.balances?.ngn
  const available = Number(ngn?.available ?? 0)

  return (
    <div data-testid="seller-dashboard-page">
      <div className="grid grid-cols-1 small:grid-cols-2 gap-4 mb-8">
        <div className="p-5 border border-ink-hairline rounded-large bg-paper-surface">
          <p className="text-sm text-ink-muted">Available balance</p>
          <p className="mt-1 font-mono tabular-nums text-2xl text-ink">
            {convertToLocale({ amount: available, currency_code: "ngn" })}
          </p>
        </div>
        <div className="p-5 border border-ink-hairline rounded-large bg-paper-surface">
          <p className="text-sm text-ink-muted">Products</p>
          <p className="mt-1 font-mono tabular-nums text-2xl text-ink">
            {products.length}
          </p>
        </div>
        <TrustScoreCard />
        <div className="p-5 border border-ink-hairline rounded-large bg-paper-surface">
          <p className="text-sm text-ink-muted">Best next step</p>
          <p className="mt-1 text-sm text-ink">
            Deliver orders quickly and reply to reviews to grow your trust score.
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-4">
        <div className="p-5 border border-ink-hairline rounded-large bg-paper-surface">
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
    </div>
  )
}
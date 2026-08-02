import { Metadata } from "next"
import { notFound } from "next/navigation"

import {
  retrieveSeller,
  listSellerProducts,
  retrieveSellerBalance,
} from "@lib/data/seller"
import Button from "@modules/common/components/button"
import LocalizedClientLink from "@modules/common/components/localized-client-link"
import { convertToLocale } from "@lib/util/money"

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
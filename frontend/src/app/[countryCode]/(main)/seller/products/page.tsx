import { Metadata } from "next"
import { notFound } from "next/navigation"

import { retrieveSeller, listSellerProducts } from "@lib/data/seller"
import Button from "@modules/common/components/button"
import LocalizedClientLink from "@modules/common/components/localized-client-link"
import { convertToLocale } from "@lib/util/money"
import { sellerHasPermission } from "@lib/seller-permissions"

export const metadata: Metadata = {
  title: "Your products",
  description: "Manage the products in your store.",
}

export default async function SellerProductsPage() {
  const seller = await retrieveSeller().catch(() => null)
  const products = (await listSellerProducts().catch(() => [])) || []

  if (!seller || !sellerHasPermission(seller, "products")) {
    notFound()
  }

  return (
    <div data-testid="seller-products-page">
      <div className="flex items-center justify-between mb-6">
        <h2 className="font-display text-2xl font-medium tracking-[-0.02em] text-ink">
          Products
        </h2>
        <Button asChild data-testid="add-product-button">
          <LocalizedClientLink href="/seller/products/new">
            Add product
          </LocalizedClientLink>
        </Button>
      </div>

      {products.length === 0 ? (
        <div className="text-center py-16 border border-dashed rounded-large">
          <p className="text-ink-muted">No products yet.</p>
          <p className="text-sm text-ink-muted mt-1">
            Add your first product to start selling.
          </p>
        </div>
      ) : (
        <ul className="overflow-hidden rounded-control border border-ink-hairline bg-white divide-y divide-ink-hairline">
          {products.map((product: any) => {
            const cheapest =
              product.variants
                ?.map((v: any) => v.prices?.[0]?.amount ?? 0)
                .sort((a: number, b: number) => a - b)[0] ?? 0
            const currency = product.variants?.[0]?.prices?.[0]?.currency_code ?? "ngn"

            return (
            <li key={product.id} className="flex items-center gap-4 bg-white p-4">
                <div className="h-14 w-14 flex-shrink-0 overflow-hidden rounded-control bg-paper-tinted">
                  {product.thumbnail ? (
                    <img
                      src={product.thumbnail}
                      alt={product.title}
                      className="w-full h-full object-cover"
                    />
                  ) : null}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-ink font-medium truncate">{product.title}</p>
                  <p className="text-sm text-ink-muted truncate">
                    {product.variants?.length
                      ? `${product.variants.length} ${
                          product.variants.length === 1 ? "option" : "options"
                        }`
                      : "No options"}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-ink font-mono tabular-nums">
                    {convertToLocale({ amount: cheapest, currency_code: currency })}
                  </p>
                  <LocalizedClientLink
                    href={`/seller/products/${product.id}`}
                    className="text-sm text-ink-muted underline underline-offset-4 hover:text-ink"
                    data-testid={`edit-product-${product.handle ?? product.id}`}
                  >
                    Edit
                  </LocalizedClientLink>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

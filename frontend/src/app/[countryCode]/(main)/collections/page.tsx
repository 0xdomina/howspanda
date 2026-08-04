import { Metadata } from "next"

import { listCollections } from "@lib/data/collections"
import { getRegion } from "@lib/data/regions"
import { HttpTypes } from "@medusajs/types"
import LocalizedClientLink from "@modules/common/components/localized-client-link"
import ProductPreview from "@modules/products/components/product-preview"

export const metadata: Metadata = {
  title: "Collections | How&rsquo;s u",
  description:
    "Browse curated collections across the How's u marketplace.",
}

export const dynamic = "force-dynamic"

export default async function CollectionsPage({
  params,
}: {
  params: Promise<{ countryCode: string }>
}) {
  const { countryCode } = await params
  const [region, { collections }] = await Promise.all([
    getRegion(countryCode),
    listCollections({
      fields: "*products",
    }),
  ])

  if (!region) {
    return (
      <div className="content-container py-6">
        <p className="text-sm text-ink-muted">
          No region configured for this store.
        </p>
      </div>
    )
  }

  return (
    <div className="content-container py-6 flex flex-col gap-y-12">
      <div>
        <h1 className="font-display text-3xl font-semibold tracking-tight text-ink">
          Collections
        </h1>
        <p className="mt-2 text-sm text-ink-muted">
          Curated groupings across the marketplace.
        </p>
      </div>

      {collections?.length ? (
        <div className="flex flex-col gap-y-12" data-testid="collections-list">
          {collections.map((collection: HttpTypes.StoreCollection) => (
            <section key={collection.id} className="flex flex-col gap-y-4">
              <div className="flex items-end justify-between">
                <h2 className="font-display text-2xl font-medium tracking-tight text-ink">
                  {collection.title}
                </h2>
                <LocalizedClientLink
                  href={`/collections/${collection.handle}`}
                  className="text-sm font-medium text-ink-muted hover:text-ink"
                >
                  Shop all
                </LocalizedClientLink>
              </div>
              {collection.products?.length ? (
                <ul className="grid grid-cols-2 small:grid-cols-3 large:grid-cols-4 gap-x-6 gap-y-8">
                  {collection.products
                    .slice(0, 4)
                    .map((product: HttpTypes.StoreProduct) => (
                      <li key={product.id}>
                        <ProductPreview
                          product={product}
                          isFeatured
                          region={region}
                        />
                      </li>
                    ))}
                </ul>
              ) : (
                <p className="text-sm text-ink-muted">
                  No products in this collection yet.
                </p>
              )}
            </section>
          ))}
        </div>
      ) : (
        <p className="text-sm text-ink-muted">No collections yet.</p>
      )}
    </div>
  )
}

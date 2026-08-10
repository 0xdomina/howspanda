import { Suspense } from "react"

import SkeletonProductGrid from "@modules/skeletons/templates/skeleton-product-grid"
import RefinementList from "@modules/store/components/refinement-list"
import { SortOptions } from "@modules/store/components/refinement-list/sort-products"
import PaginatedProducts from "@modules/store/templates/paginated-products"
import ShareButton from "@modules/common/components/share-button"
import { HttpTypes } from "@medusajs/types"
import { getBaseURL } from "@lib/util/env"

export default function CollectionTemplate({
  sortBy,
  collection,
  page,
  countryCode,
}: {
  sortBy?: SortOptions
  collection: HttpTypes.StoreCollection
  page?: string
  countryCode: string
}) {
  const pageNumber = page ? parseInt(page) : 1
  const sort = sortBy || "created_at"

  return (
    <div className="figma-container flex flex-col gap-8 py-10 small:flex-row small:items-start small:py-16">
      <RefinementList sortBy={sort} />
      <div className="w-full">
        <div className="mb-8 flex items-start justify-between gap-4">
          <h1 className="font-display text-3xl font-medium tracking-[-0.02em] text-ink">
            {collection.title}
          </h1>
          <ShareButton
            entity="collection"
            entityId={collection.id}
            payload={{
              url: `${getBaseURL()}/${countryCode}/collections/${collection.handle}`,
              text: `${collection.title} on How's u`,
              title: collection.title,
            }}
          />
        </div>
        <Suspense
          fallback={
            <SkeletonProductGrid
              numberOfProducts={collection.products?.length}
            />
          }
        >
          <PaginatedProducts
            sortBy={sort}
            page={pageNumber}
            collectionId={collection.id}
            countryCode={countryCode}
          />
        </Suspense>
      </div>
    </div>
  )
}

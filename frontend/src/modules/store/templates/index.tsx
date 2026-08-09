import { Suspense } from "react"

import SkeletonProductGrid from "@modules/skeletons/templates/skeleton-product-grid"
import RefinementList from "@modules/store/components/refinement-list"
import { SortOptions } from "@modules/store/components/refinement-list/sort-products"

import PaginatedProducts from "./paginated-products"

const StoreTemplate = ({
  sortBy,
  page,
  q,
  countryCode,
}: {
  sortBy?: SortOptions
  page?: string
  q?: string
  countryCode: string
}) => {
  const pageNumber = page ? parseInt(page) : 1
  const sort = sortBy || "created_at"

  return (
    <div
      className="figma-container flex flex-col gap-8 py-10 small:flex-row small:items-start"
      data-testid="category-container"
    >
      <RefinementList sortBy={sort} />
      <div className="min-w-0 flex-1">
        <div className="mb-8 border-b border-ink-hairline pb-6">
          <h1
            className="font-display text-3xl font-semibold tracking-tight text-ink"
            data-testid="store-page-title"
          >
            {q ? `Search results for “${q}”` : "All products"}
          </h1>
        </div>
        <Suspense fallback={<SkeletonProductGrid />}>
          <PaginatedProducts
            sortBy={sort}
            page={pageNumber}
            countryCode={countryCode}
            q={q}
          />
        </Suspense>
      </div>
    </div>
  )
}

export default StoreTemplate

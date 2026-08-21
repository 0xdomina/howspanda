import React, { Suspense } from "react"

import ImageGallery from "@modules/products/components/image-gallery"
import ProductActions from "@modules/products/components/product-actions"
import ProductTabs from "@modules/products/components/product-tabs"
import RelatedProducts from "@modules/products/components/related-products"
import ProductInfo from "@modules/products/templates/product-info"
import ShareButton from "@modules/common/components/share-button"
import SkeletonRelatedProducts from "@modules/skeletons/templates/skeleton-related-products"
import { notFound } from "next/navigation"
import { HttpTypes } from "@medusajs/types"
import { getBaseURL } from "@lib/util/env"
import ProductReviews from "@modules/products/components/product-reviews"
import type { ProductRatingSummary } from "@lib/data/reviews"

import ProductActionsWrapper from "./product-actions-wrapper"

type ProductTemplateProps = {
  product: HttpTypes.StoreProduct
  region: HttpTypes.StoreRegion
  countryCode: string
  images: HttpTypes.StoreProductImage[]
  ratingSummary: ProductRatingSummary
}

const Stars = ({ average }: { average: number }) => {
  const rounded = Math.max(0, Math.min(5, Math.round(average)))
  return (
    <span className="text-amber-500" aria-label={`${average} out of 5 stars`}>
      {"★".repeat(rounded)}
      <span className="text-ink/20">{"★".repeat(5 - rounded)}</span>
    </span>
  )
}

const ProductTemplate: React.FC<ProductTemplateProps> = ({
  product,
  region,
  countryCode,
  images,
  ratingSummary,
}) => {
  if (!product || !product.id) {
    return notFound()
  }

  const videoUrl =
    typeof product.metadata?.product_video === "string"
      ? (product.metadata.product_video as string)
      : undefined

  return (
    <>
      <div
        className="figma-container relative flex flex-col gap-8 py-10 small:flex-row small:items-start"
        data-testid="product-container"
      >
        <div className="order-1 w-full min-w-0 flex-1">
          <ImageGallery images={images} videoUrl={videoUrl} title={product.title} />
        </div>

        <div className="order-2 flex w-full flex-col gap-y-8 small:sticky small:top-28 small:max-w-[400px]">
          <div className="glass-panel rounded-control p-6 small:p-8">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <ProductInfo product={product} />
              </div>
              <ShareButton
                entity="product"
                entityId={product.id}
                payload={{
                  url: `${getBaseURL()}/${countryCode}/products/${product.handle}`,
                  text: `${product.title} on How's u`,
                  title: product.title,
                  description: product.description || undefined,
                  image: product.thumbnail || undefined,
                  hashtags: product.collection ? [product.collection.handle] : [],
                }}
              />
            </div>

            <div className="mt-4">
              {ratingSummary.count > 0 ? (
                <a
                  href="#reviews"
                  className="flex items-center gap-2 text-sm text-ink transition-colors hover:text-brand"
                >
                  <Stars average={ratingSummary.average} />
                  <span className="font-medium">
                    {ratingSummary.average.toFixed(1)}
                  </span>
                  <span className="text-ink-muted">
                    ({ratingSummary.count} review
                    {ratingSummary.count === 1 ? "" : "s"})
                  </span>
                </a>
              ) : (
                <p className="text-xs text-ink-muted">No reviews yet</p>
              )}
            </div>

            <div className="mt-6 border-t border-ink-hairline pt-6">
              <Suspense
                fallback={
                  <ProductActions
                    disabled={true}
                    product={product}
                    region={region}
                  />
                }
              >
                <ProductActionsWrapper id={product.id} region={region} />
              </Suspense>
            </div>
          </div>

          <ProductTabs product={product} />
        </div>
      </div>
      <div
        className="figma-container my-16 small:my-24"
        data-testid="related-products-container"
      >
        <Suspense fallback={<SkeletonRelatedProducts />}>
          <RelatedProducts product={product} countryCode={countryCode} />
        </Suspense>
      </div>
      <ProductReviews summary={ratingSummary} />
    </>
  )
}

export default ProductTemplate

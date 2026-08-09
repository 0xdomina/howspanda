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

import ProductActionsWrapper from "./product-actions-wrapper"

type ProductTemplateProps = {
  product: HttpTypes.StoreProduct
  region: HttpTypes.StoreRegion
  countryCode: string
  images: HttpTypes.StoreProductImage[]
}

const ProductTemplate: React.FC<ProductTemplateProps> = ({
  product,
  region,
  countryCode,
  images,
}) => {
  if (!product || !product.id) {
    return notFound()
  }

  return (
    <>
      <div
        className="figma-container relative flex flex-col gap-8 py-10 small:flex-row small:items-start"
        data-testid="product-container"
      >
        <div className="order-2 flex w-full flex-col gap-y-6 py-8 small:order-3 small:sticky small:top-28 small:max-w-[300px] small:py-0">
          <div className="flex items-start justify-between gap-4">
            <ProductInfo product={product} />
            <ShareButton
              entity="product"
              entityId={product.id}
              payload={{
                url: `${getBaseURL()}/${countryCode}/products/${product.handle}`,
                text: `${product.title} on How's u`,
                title: product.title,
                image: product.thumbnail ?? undefined,
                hashtags: product.collection ? [product.collection.handle] : [],
              }}
            />
          </div>
          <ProductTabs product={product} />
        </div>
        <div className="order-1 relative block w-full small:order-2">
          <ImageGallery images={images} />
        </div>
        <div className="order-3 flex w-full flex-col gap-y-12 py-8 small:order-3 small:sticky small:top-28 small:max-w-[300px] small:py-0">
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
      <div
        className="figma-container my-16 small:my-24"
        data-testid="related-products-container"
      >
        <Suspense fallback={<SkeletonRelatedProducts />}>
          <RelatedProducts product={product} countryCode={countryCode} />
        </Suspense>
      </div>
    </>
  )
}

export default ProductTemplate

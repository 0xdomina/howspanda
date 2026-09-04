import { Text } from "@medusajs/ui"
import { getProductPrice } from "@lib/util/get-product-price"
import { HttpTypes } from "@medusajs/types"
import LocalizedClientLink from "@modules/common/components/localized-client-link"
import ProductShare from "@modules/products/components/product-share"
import Thumbnail from "../thumbnail"
import PreviewPrice from "./price"

export default async function ProductPreview({
  product,
  isFeatured,
  region,
}: {
  product: HttpTypes.StoreProduct
  isFeatured?: boolean
  region: HttpTypes.StoreRegion
}) {
  const { cheapestPrice } = getProductPrice({
    product,
  })
  const metadata = (product.metadata ?? {}) as Record<string, unknown>
  const isFlash = metadata.flash_sale === true

  return (
    <div className="group card-lift rounded-control p-1">
      <div data-testid="product-wrapper" className="relative rounded-control">
        {isFlash && (
          <span className="absolute left-2 top-2 z-10 rounded-full bg-brand px-2 py-0.5 text-[11px] font-semibold text-white shadow-sm">
            ⚡ Flash
          </span>
        )}
        <LocalizedClientLink
          href={`/products/${product.handle}`}
          className="block focus:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-4"
          aria-label={`View ${product.title}`}
        >
          <Thumbnail
            thumbnail={product.thumbnail}
            images={product.images}
            size="full"
            isFeatured={isFeatured}
          />
          <div className="mt-4 flex items-start justify-between gap-3">
            <Text
              className="text-sm font-medium leading-snug text-ink transition-colors duration-200 group-hover:text-brand"
              data-testid="product-title"
            >
              {product.title}
            </Text>
            <div className="flex items-center gap-x-2 pt-0.5">
              {cheapestPrice && <PreviewPrice price={cheapestPrice} />}
            </div>
          </div>
        </LocalizedClientLink>
        <div className="mt-3 flex justify-end">
          <ProductShare product={product} />
        </div>
      </div>
    </div>
  )
}

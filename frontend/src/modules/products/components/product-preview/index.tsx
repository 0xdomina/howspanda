import { Text } from "@medusajs/ui"
import { getProductPrice } from "@lib/util/get-product-price"
import { HttpTypes } from "@medusajs/types"
import LocalizedClientLink from "@modules/common/components/localized-client-link"
import Thumbnail from "../thumbnail"
import PreviewPrice from "./price"
import WishlistButton from "@modules/wishlist/components/wishlist-button"
import QuickView from "@modules/products/components/quick-view"
import ProductShare from "@modules/products/components/product-share"

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

  return (
    <div className="group">
      <div data-testid="product-wrapper" className="relative rounded-control">
        <LocalizedClientLink href={`/products/${product.handle}`} className="block">
        <Thumbnail
          thumbnail={product.thumbnail}
          images={product.images}
          size="full"
          isFeatured={isFeatured}
        />
        <div className="mt-4 flex items-start justify-between gap-3">
          <Text
            className="text-sm font-medium leading-snug text-ink group-hover:text-ink-muted"
            data-testid="product-title"
          >
            {product.title}
          </Text>
          <div className="flex items-center gap-x-2 pt-0.5">
            {cheapestPrice && <PreviewPrice price={cheapestPrice} />}
          </div>
          </div>
        </LocalizedClientLink>
        <div className="absolute right-3 top-3 z-10 flex flex-col gap-2"><WishlistButton item={{ id: product.id, handle: product.handle, title: product.title, thumbnail: product.thumbnail, price: cheapestPrice?.calculated_price }} /><QuickView item={{ title: product.title, description: product.description, thumbnail: product.thumbnail, price: cheapestPrice?.calculated_price, href: `/products/${product.handle}` }} /><ProductShare product={product} /></div>
      </div>
    </div>
  )
}

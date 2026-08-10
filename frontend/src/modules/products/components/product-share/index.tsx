"use client"

import { HttpTypes } from "@medusajs/types"

import ShareButton from "@modules/common/components/share-button"
import { useShareUrl } from "@lib/hooks/use-share-url"

const ProductShare = ({ product }: { product: HttpTypes.StoreProduct }) => {
  const shareUrl = useShareUrl()

  return (
    <ShareButton
      entity="product"
      entityId={product.id}
      className="grid h-8 w-8 place-items-center rounded-full bg-white transition-all duration-fast active:scale-95"
      payload={{
        url: shareUrl(`/products/${product.handle}`),
        text: `${product.title} on How's u`,
        title: product.title,
        image: product.thumbnail ?? undefined,
        hashtags: product.collection?.handle ? [product.collection.handle] : [],
      }}
    />
  )
}

export default ProductShare

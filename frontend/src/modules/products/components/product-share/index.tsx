"use client"

import ShareButton from "@modules/common/components/share-button"
import { useShareUrl } from "@lib/hooks/use-share-url"

type ShareableProduct = {
  id: string
  title: string
  handle: string
  thumbnail?: string | null
  description?: string | null
  collection?: { handle: string } | null
}

const ProductShare = ({ product }: { product: ShareableProduct }) => {
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
        description: product.description || "Shop this find from an independent seller on How's u.",
        image: product.thumbnail ?? undefined,
        hashtags: product.collection?.handle ? [product.collection.handle] : [],
      }}
    />
  )
}

export default ProductShare

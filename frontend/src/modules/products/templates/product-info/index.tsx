import { HttpTypes } from "@medusajs/types"
import { Heading, Text } from "@medusajs/ui"
import LocalizedClientLink from "@modules/common/components/localized-client-link"

type ProductInfoProps = {
  product: HttpTypes.StoreProduct
}

const ProductInfo = ({ product }: ProductInfoProps) => {
  return (
    <div id="product-info">
      <div className="flex flex-col gap-y-4 lg:max-w-[500px] mx-auto">
        {product.collection && (
          <LocalizedClientLink
            href={`/collections/${product.collection.handle}`}
            className="eyebrow text-ink-muted hover:text-ink"
          >
            {product.collection.title}
          </LocalizedClientLink>
        )}
        <Heading
          level="h2"
          className="font-display text-3xl font-semibold tracking-tight text-ink"
          data-testid="product-title"
        >
          {product.title}
        </Heading>

        <Text
          className="text-medium text-ink-muted whitespace-pre-line"
          data-testid="product-description"
        >
          {product.description}
        </Text>
      </div>
    </div>
  )
}

export default ProductInfo

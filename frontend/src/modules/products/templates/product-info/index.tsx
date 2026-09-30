import { HttpTypes } from "@medusajs/types"
import { Heading, Text } from "@medusajs/ui"
import LocalizedClientLink from "@modules/common/components/localized-client-link"

type ProductInfoProps = {
  product: HttpTypes.StoreProduct
}

const ProductInfo = ({ product }: ProductInfoProps) => {
  const delivery = (product.metadata as Record<string, any> | undefined)?.delivery as
    | { mode?: string; fee?: number }
    | undefined
  const deliveryLabel =
    delivery?.mode === "fixed" && Number(delivery?.fee) > 0
      ? `Delivery ₦${(Number(delivery.fee) / 100).toLocaleString("en-NG")} · paid with order`
      : delivery?.mode === "free"
        ? "Free delivery"
        : delivery?.mode === "courier"
          ? "Courier on request — arranged after payment"
          : null
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

        {deliveryLabel && (
          <p className="text-sm font-medium text-emerald-700" data-testid="product-delivery">
            {deliveryLabel}
          </p>
        )}

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

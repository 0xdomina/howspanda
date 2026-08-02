import { clx } from "@medusajs/ui"

import { getProductPrice } from "@lib/util/get-product-price"
import { HttpTypes } from "@medusajs/types"
import MoneyText from "@modules/common/components/money-text"
import MoneySkeleton from "@modules/common/components/money-skeleton"

export default function ProductPrice({
  product,
  variant,
}: {
  product: HttpTypes.StoreProduct
  variant?: HttpTypes.StoreProductVariant
}) {
  const { cheapestPrice, variantPrice } = getProductPrice({
    product,
    variantId: variant?.id,
  })

  const selectedPrice = variant ? variantPrice : cheapestPrice

  if (!selectedPrice) {
    return (
      <div className="flex flex-col gap-1">
        <MoneySkeleton width={96} />
        <MoneySkeleton width={56} />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-1 text-ink">
      <span
        className={clx(
          "money text-2xl font-medium tracking-tight",
          selectedPrice.price_type === "sale" && "text-semantic-danger"
        )}
        data-testid="product-price"
        data-value={selectedPrice.calculated_price_number}
      >
        {!variant && "From "}
        <MoneyText
          amount={selectedPrice.calculated_price_number}
          currency_code={selectedPrice.currency_code}
        />
      </span>
      {selectedPrice.price_type === "sale" && (
        <span className="flex items-center gap-2">
          <span className="text-sm text-ink-muted">
            <MoneyText
              amount={selectedPrice.original_price_number}
              currency_code={selectedPrice.currency_code}
              className="line-through"
              data-testid="original-product-price"
              data-value={selectedPrice.original_price_number}
            />
          </span>
          <span className="text-sm font-medium text-semantic-success">
            -{selectedPrice.percentage_diff}%
          </span>
        </span>
      )}
    </div>
  )
}

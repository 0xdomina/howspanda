import { clx } from "@medusajs/ui"
import MoneyText from "@modules/common/components/money-text"
import { VariantPrice } from "types/global"

export default async function PreviewPrice({ price }: { price: VariantPrice }) {
  if (!price) {
    return null
  }

  return (
    <span className="flex flex-col items-end gap-0.5">
      {price.price_type === "sale" && (
        <MoneyText
          amount={price.original_price_number}
          currency_code={price.currency_code}
          className="text-xs text-ink-muted line-through"
          data-testid="original-price"
        />
      )}
      <MoneyText
        amount={price.calculated_price_number}
        currency_code={price.currency_code}
        className={clx(
          "text-sm font-medium",
          price.price_type === "sale"
            ? "text-semantic-danger"
            : "text-ink"
        )}
        data-testid="price"
      />
    </span>
  )
}

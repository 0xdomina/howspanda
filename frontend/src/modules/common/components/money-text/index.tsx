import { convertToLocale } from "@lib/util/money"
import { clx } from "@medusajs/ui"

type MoneyTextProps = {
  amount: number
  currency_code: string
  minimumFractionDigits?: number
  maximumFractionDigits?: number
  className?: string
} & Omit<React.HTMLAttributes<HTMLSpanElement>, "className">

/**
 * All money on the platform renders through this component:
 * mono face, tabular numerals, precise locale formatting.
 */
const MoneyText = ({
  amount,
  currency_code,
  minimumFractionDigits,
  maximumFractionDigits,
  className,
  ...rest
}: MoneyTextProps) => {
  return (
    <span className={clx("money", className)} {...rest}>
      {convertToLocale({
        amount,
        currency_code,
        minimumFractionDigits,
        maximumFractionDigits,
      })}
    </span>
  )
}

export default MoneyText
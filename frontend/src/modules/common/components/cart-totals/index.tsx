"use client"

import MoneyText from "@modules/common/components/money-text"
import React from "react"

type CartTotalsProps = {
  totals: {
    total?: number | null
    subtotal?: number | null
    tax_total?: number | null
    currency_code: string
    item_subtotal?: number | null
    shipping_subtotal?: number | null
    discount_subtotal?: number | null
  }
}

const Row = ({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) => (
  <div className="flex items-center justify-between">
    <span>{label}</span>
    <span>{children}</span>
  </div>
)

const CartTotals: React.FC<CartTotalsProps> = ({ totals }) => {
  const {
    currency_code,
    total,
    tax_total,
    item_subtotal,
    shipping_subtotal,
    discount_subtotal,
  } = totals

  return (
    <div>
      <div className="flex flex-col gap-y-2 text-sm text-ink-muted">
        <Row label="Items">
          <MoneyText
            amount={item_subtotal ?? 0}
            currency_code={currency_code}
            data-testid="cart-subtotal"
            data-value={item_subtotal || 0}
          />
        </Row>
        <Row label="Shipping">
          <MoneyText
            amount={shipping_subtotal ?? 0}
            currency_code={currency_code}
            data-testid="cart-shipping"
            data-value={shipping_subtotal || 0}
          />
        </Row>
        {!!discount_subtotal && (
          <Row label="Discount">
            <MoneyText
              amount={discount_subtotal ?? 0}
              currency_code={currency_code}
              className="text-semantic-success"
              data-testid="cart-discount"
              data-value={discount_subtotal || 0}
            />
          </Row>
        )}
        <Row label="Taxes">
          <MoneyText
            amount={tax_total ?? 0}
            currency_code={currency_code}
            data-testid="cart-taxes"
            data-value={tax_total || 0}
          />
        </Row>
      </div>
      <div className="my-4 h-px w-full border-b border-ink-hairline" />
      <div className="mb-2 flex items-center justify-between text-ink">
        <span className="text-sm font-medium">Total</span>
        <MoneyText
          amount={total ?? 0}
          currency_code={currency_code}
          className="text-xl font-semibold"
          data-testid="cart-total"
          data-value={total || 0}
        />
      </div>
      <div className="mt-4 h-px w-full border-b border-ink-hairline" />
    </div>
  )
}

export default CartTotals
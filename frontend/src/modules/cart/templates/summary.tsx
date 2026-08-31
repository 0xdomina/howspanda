"use client"

import Button from "@modules/common/components/button"

import CartTotals from "@modules/common/components/cart-totals"
import Divider from "@modules/common/components/divider"
import DiscountCode from "@modules/checkout/components/discount-code"
import RedeemableCode from "@modules/checkout/components/redeemable-code"
import { prepareCheckout } from "@lib/data/cart"
import { HttpTypes } from "@medusajs/types"
import { useParams } from "next/navigation"

type SummaryProps = {
  cart: HttpTypes.StoreCart & {
    promotions: HttpTypes.StorePromotion[]
  }
}

function getCheckoutStep(cart: HttpTypes.StoreCart) {
  if (!cart?.shipping_address?.address_1 || !cart.email) {
    return "address"
  } else if (cart?.shipping_methods?.length === 0) {
    return "delivery"
  } else {
    return "payment"
  }
}

const Summary = ({ cart }: SummaryProps) => {
  const step = getCheckoutStep(cart)
  const countryCode = useParams().countryCode as string

  return (
    <div className="flex flex-col gap-y-4">
      <h2 className="font-display text-2xl font-medium tracking-tight text-ink">
        Summary
      </h2>
      <DiscountCode cart={cart} />
      <RedeemableCode cart={cart} />
      <Divider />
      <CartTotals totals={cart} />
      <form action={prepareCheckout.bind(null, countryCode, step, cart.id)}>
        <Button type="submit" className="w-full h-10" rounded="pill">
          Go to checkout
        </Button>
      </form>
    </div>
  )
}

export default Summary

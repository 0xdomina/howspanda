import { listCartShippingMethods } from "@lib/data/fulfillment"
import { listCartPaymentMethods } from "@lib/data/payment"
import { getPaymentRails } from "@lib/data/payment-rails"
import { HttpTypes } from "@medusajs/types"
import Addresses from "@modules/checkout/components/addresses"
import Payment from "@modules/checkout/components/payment"
import Review from "@modules/checkout/components/review"
import Shipping from "@modules/checkout/components/shipping"

export default async function CheckoutForm({
  cart,
  customer,
}: {
  cart: HttpTypes.StoreCart | null
  customer: HttpTypes.StoreCustomer | null
}) {
  if (!cart) {
    return null
  }

  const shippingMethods = await listCartShippingMethods(cart.id)
  const paymentMethods = await listCartPaymentMethods(cart.region?.id ?? "")
  const rails = await getPaymentRails()

  if (!shippingMethods || !paymentMethods) {
    return null
  }

  // Only surface payment providers whose rail is toggled ON (admin-runtime
  // switch). If the rails fetch failed (empty), keep every provider available
  // rather than hiding all payment options.
  const enabledIds = new Set(
    rails.filter((rail) => rail.enabled).map((rail) => rail.providerId)
  )
  const availablePaymentMethods =
    rails.length > 0
      ? paymentMethods.filter((method) => enabledIds.has(method.id))
      : paymentMethods

  return (
    <div className="w-full grid grid-cols-1 gap-y-8">
      <Addresses cart={cart} customer={customer} />

      <Shipping cart={cart} availableShippingMethods={shippingMethods} />

      <Payment cart={cart} availablePaymentMethods={availablePaymentMethods} />

      <Review cart={cart} />
    </div>
  )
}

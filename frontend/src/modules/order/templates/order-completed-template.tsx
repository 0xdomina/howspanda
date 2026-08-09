import { cookies as nextCookies } from "next/headers"

import CartTotals from "@modules/common/components/cart-totals"
import BuyerOrderActions from "@modules/order/components/buyer-actions"
import Help from "@modules/order/components/help"
import Items from "@modules/order/components/items"
import OrderDetails from "@modules/order/components/order-details"
import ShareButton from "@modules/common/components/share-button"
import ShippingDetails from "@modules/order/components/shipping-details"
import PaymentDetails from "@modules/order/components/payment-details"
import { HttpTypes } from "@medusajs/types"
import { getBaseURL } from "@lib/util/env"

type OrderCompletedTemplateProps = {
  order: HttpTypes.StoreOrder
  countryCode?: string
}

export default async function OrderCompletedTemplate({
  order,
  countryCode = "en",
}: OrderCompletedTemplateProps) {
  const shareText = `My order on How's u is confirmed.`

  return (
    <div className="min-h-[calc(100vh-64px)] bg-[#fafafa] py-10 small:py-16">
      <div className="figma-container flex w-full max-w-4xl flex-col items-center justify-center gap-y-10">
        <div
          className="figma-surface flex h-full w-full max-w-4xl flex-col gap-4 p-6 small:p-10"
          data-testid="order-complete-container"
        >
          <div className="mb-4 flex items-start justify-between gap-4">
            <div>
              <h1 className="font-display text-3xl font-medium tracking-tight text-ink">
                Order confirmed
              </h1>
              <p className="mt-1 text-sm text-ink-muted">
                {order.email ? `A confirmation was sent to ${order.email}.` : "A confirmation is on its way."}
              </p>
            </div>
            <ShareButton
              entity="order"
              entityId={order.id}
              payload={{
                url: `${getBaseURL()}/${countryCode}/order/${order.id}/confirmed`,
                text: shareText,
                title: "Order confirmed",
              }}
            />
          </div>
          <OrderDetails order={order} />
          <h2 className="font-display text-2xl font-medium tracking-tight text-ink">
            Summary
          </h2>
          <Items order={order} />
          <CartTotals totals={order} />
          <BuyerOrderActions
            orderId={order.id}
            email={order.email ?? ""}
            items={(order.items ?? []) as any}
          />
          <ShippingDetails order={order} />
          <PaymentDetails order={order} />
          <Help />
        </div>
      </div>
    </div>
  )
}

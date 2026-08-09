import ItemsPreviewTemplate from "@modules/cart/templates/preview"
import DiscountCode from "@modules/checkout/components/discount-code"
import CartTotals from "@modules/common/components/cart-totals"
import Divider from "@modules/common/components/divider"

const CheckoutSummary = ({ cart }: { cart: any }) => {
  return (
    <div className="sticky top-28 flex flex-col-reverse gap-y-8 py-8 small:flex-col small:py-0">
      <div className="figma-surface flex w-full flex-col p-6">
        <Divider className="my-6 small:hidden" />
        <h2 className="font-display text-2xl font-medium tracking-tight text-ink">
          In your cart
        </h2>
        <Divider className="my-6" />
        <CartTotals totals={cart} />
        <ItemsPreviewTemplate cart={cart} />
        <div className="my-6">
          <DiscountCode cart={cart} />
        </div>
      </div>
    </div>
  )
}

export default CheckoutSummary

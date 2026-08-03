import { retrieveCart } from "@lib/data/cart"
import { retrieveCustomer } from "@lib/data/customer"
import PaymentWrapper from "@modules/checkout/components/payment-wrapper"
import CheckoutForm from "@modules/checkout/templates/checkout-form"
import CheckoutSummary from "@modules/checkout/templates/checkout-summary"
import LocalizedClientLink from "@modules/common/components/localized-client-link"
import { Metadata } from "next"
import { notFound } from "next/navigation"

export const metadata: Metadata = {
  title: "Checkout",
}

export default async function Checkout() {
  const cart = await retrieveCart()

  if (!cart) {
    return notFound()
  }

  const customer = await retrieveCustomer()

  if (!customer) {
    return (
      <div
        className="content-container py-12"
        data-testid="checkout-auth-required"
      >
        <div className="mx-auto max-w-md rounded-large border border-ink-hairline bg-paper-surface p-8 text-center">
          <h1 className="font-display text-2xl font-medium tracking-[-0.02em] text-ink">
            Create an account to checkout
          </h1>
          <p className="mt-2 text-sm text-ink-muted">
            Your cart is saved. Sign in or create a free account to place your
            order. You&apos;ll also need an account for payouts, wallet, and
            tracking.
          </p>
          <div className="mt-6 flex flex-col gap-3">
            <LocalizedClientLink href="/account">
              <span className="block w-full rounded-medium bg-ink px-4 py-3 text-sm font-medium text-white hover:bg-ink/90">
                Sign in
              </span>
            </LocalizedClientLink>
            <LocalizedClientLink href="/account?mode=register">
              <span className="block w-full rounded-medium border border-ink-strong px-4 py-3 text-sm font-medium text-ink hover:bg-ink hover:text-white">
                Create an account
              </span>
            </LocalizedClientLink>
          </div>
          <p className="mt-4 text-xs text-ink-muted">
            You can keep browsing — your cart stays with you.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 small:grid-cols-[1fr_416px] content-container gap-x-40 py-12">
      <PaymentWrapper cart={cart}>
        <CheckoutForm cart={cart} customer={customer} />
      </PaymentWrapper>
      <CheckoutSummary cart={cart} />
    </div>
  )
}

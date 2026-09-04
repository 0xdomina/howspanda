import type { HttpTypes } from "@medusajs/types"

const STEPS = ["Address", "Delivery", "Payment", "Review"] as const

// Progress header for the single-page checkout: each section completes in
// order, derived from the live cart so a reload never loses your place.
export default function CheckoutProgress({
  cart,
}: {
  cart: HttpTypes.StoreCart
}) {
  const addressDone = Boolean(cart.email && cart.shipping_address?.address_1)
  const deliveryDone = (cart.shipping_methods?.length ?? 0) > 0
  const paymentDone =
    (cart.payment_collection?.payment_sessions?.length ?? 0) > 0
  const done = [addressDone, deliveryDone, paymentDone]
  const current = done.findIndex((d) => !d)
  const activeStep = current === -1 ? 3 : current

  return (
    <ol
      className="mb-8 flex items-center gap-1"
      aria-label="Checkout progress"
      data-testid="checkout-progress"
    >
      {STEPS.map((label, i) => {
        const isDone = i < activeStep || (i === 3 && paymentDone)
        const isActive = i === activeStep
        return (
          <li key={label} className="flex flex-1 items-center gap-1.5 last:flex-none">
            <span
              className={
                "flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold " +
                (isDone
                  ? "bg-emerald-600 text-white"
                  : isActive
                    ? "bg-ink text-white"
                    : "bg-ink/10 text-ink-muted")
              }
              aria-current={isActive ? "step" : undefined}
            >
              {isDone ? "✓" : i + 1}
            </span>
            <span
              className={
                "hidden text-xs sm:inline " +
                (isDone || isActive
                  ? "font-medium text-ink"
                  : "text-ink-muted")
              }
            >
              {label}
            </span>
            {i < STEPS.length - 1 && (
              <span
                className={
                  "mx-1 h-px flex-1 " + (isDone ? "bg-emerald-600" : "bg-ink/10")
                }
                aria-hidden="true"
              />
            )}
          </li>
        )
      })}
    </ol>
  )
}

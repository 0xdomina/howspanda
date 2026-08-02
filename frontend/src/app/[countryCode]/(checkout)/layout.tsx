import LocalizedClientLink from "@modules/common/components/localized-client-link"
import ChevronDown from "@modules/common/icons/chevron-down"
import { Text } from "@medusajs/ui"

export default function CheckoutLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="w-full bg-paper relative small:min-h-screen">
      <div className="h-16 bg-paper-surface border-b border-ink-hairline">
        <nav className="flex h-full items-center content-container justify-between">
          <LocalizedClientLink
            href="/cart"
            className="text-small-semi text-ink flex items-center gap-x-2 flex-1 basis-0"
            data-testid="back-to-cart-link"
          >
            <ChevronDown className="rotate-90" size={16} />
            <span className="mt-px hidden small:block txt-compact-plus text-ink-muted hover:text-ink">
              Back to shopping cart
            </span>
            <span className="mt-px block small:hidden txt-compact-plus text-ink-muted hover:text-ink">
              Back
            </span>
          </LocalizedClientLink>
          <LocalizedClientLink
            href="/"
            className="font-display text-lg font-semibold tracking-tight text-ink hover:text-ink-muted"
            data-testid="store-link"
          >
            How&rsquo;s u
          </LocalizedClientLink>
          <div className="flex-1 basis-0" />
        </nav>
      </div>
      <div className="relative" data-testid="checkout-container">{children}</div>
      <div className="py-4 w-full flex items-center justify-center">
        <Text className="txt-compact-small text-ink-muted">
          How&rsquo;s u — how-to guides, from creators like you.
        </Text>
      </div>
    </div>
  )
}

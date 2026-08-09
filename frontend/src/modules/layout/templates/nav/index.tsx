import { Suspense } from "react"

import { listLocales } from "@lib/data/locales"
import { getLocale } from "@lib/data/locale-actions"
import { listRegions } from "@lib/data/regions"
import { retrieveCustomer } from "@lib/data/customer"
import { retrieveSeller } from "@lib/data/seller"
import { StoreRegion } from "@medusajs/types"
import LocalizedClientLink from "@modules/common/components/localized-client-link"
import CartButton from "@modules/layout/components/cart-button"
import SideMenu from "@modules/layout/components/side-menu"
import SearchForm from "@modules/layout/components/search-form"
import WishlistLink from "@modules/wishlist/components/wishlist-link"

export default async function Nav() {
  const [regions, locales, currentLocale, customer, seller] = await Promise.all([
    listRegions().then((items: StoreRegion[]) => items),
    listLocales(),
    getLocale(),
    retrieveCustomer(),
    retrieveSeller(),
  ])

  return (
    <div className="sticky top-0 z-50 bg-white">
      <header className="border-b border-ink-hairline bg-white">
        <nav className="figma-container flex min-h-[78px] items-center justify-between gap-6 py-4" aria-label="Main navigation">
          <div>
            <SideMenu regions={regions} locales={locales} currentLocale={currentLocale} />
          </div>
          <LocalizedClientLink href="/" className="font-display text-2xl font-bold tracking-tight text-ink" data-testid="nav-store-link">How&rsquo;s U</LocalizedClientLink>
          <div className="hidden items-center gap-8 text-sm text-ink small:flex">
            <LocalizedClientLink href="/" className="border-b border-ink pb-1">Home</LocalizedClientLink>
            <LocalizedClientLink href="/about" className="hover:text-brand">About</LocalizedClientLink>
            <LocalizedClientLink href="/contact" className="hover:text-brand">Contact</LocalizedClientLink>
            <LocalizedClientLink href={seller ? "/seller" : customer ? "/account" : "/account?mode=register"} className="hover:text-brand">
              {seller ? "Dashboard" : customer ? "Account" : "Sign Up"}
            </LocalizedClientLink>
          </div>
          <div className="flex items-center gap-4">
            <SearchForm />
            <LocalizedClientLink href="/account" aria-label="Account" className="hidden h-8 w-8 items-center justify-center rounded-full border border-ink-hairline text-lg small:flex">♙</LocalizedClientLink>
            <WishlistLink />
            <Suspense fallback={<LocalizedClientLink href="/cart" aria-label="Cart" className="grid h-8 w-8 place-items-center rounded-full border border-ink-hairline">🛒</LocalizedClientLink>}>
              <CartButton />
            </Suspense>
          </div>
        </nav>
      </header>
    </div>
  )
}

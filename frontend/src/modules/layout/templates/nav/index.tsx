import { Suspense } from "react"
import Image from "next/image"

import { listLocales } from "@lib/data/locales"
import { getLocale } from "@lib/data/locale-actions"
import { listRegions } from "@lib/data/regions"
import { retrieveCustomer } from "@lib/data/customer"
import { retrieveSeller } from "@lib/data/seller"
import { retrieveFeatures } from "@lib/data/kyc"
import { StoreRegion } from "@medusajs/types"
import LocalizedClientLink from "@modules/common/components/localized-client-link"
import CartButton from "@modules/layout/components/cart-button"
import SideMenu from "@modules/layout/components/side-menu"
import SearchForm from "@modules/layout/components/search-form"
import WishlistLink from "@modules/wishlist/components/wishlist-link"

export default async function Nav() {
  const [regions, locales, currentLocale, customer, seller, features] = await Promise.all([
    listRegions().then((items: StoreRegion[]) => items),
    listLocales(),
    getLocale(),
    retrieveCustomer(),
    retrieveSeller(),
    retrieveFeatures().catch(() => ({ malls: false, nin_verification: false, product_video: true })),
  ])

  return (
    <div className="glass-nav sticky top-0 z-50">
      <header className="border-b border-ink-hairline">
        <nav className="figma-container flex min-h-[78px] items-center justify-between gap-6 py-4" aria-label="Main navigation">
          <div>
            <SideMenu regions={regions} locales={locales} currentLocale={currentLocale} mallsEnabled={features.malls} isAuthenticated={Boolean(customer)} hasSeller={Boolean(seller)} />
          </div>
          <LocalizedClientLink href="/" className="inline-flex items-center" data-testid="nav-store-link" aria-label="How’s U home">
            <Image src="/brand/hows-u-logo.svg" alt="How’s U" width={128} height={40} priority className="h-10 w-auto" />
          </LocalizedClientLink>
          <div className="hidden items-center gap-7 text-sm text-ink small:flex">
            <LocalizedClientLink href="/" className="border-b border-ink pb-1">Home</LocalizedClientLink>
            <LocalizedClientLink href="/about" className="hover:text-brand">About</LocalizedClientLink>
            <LocalizedClientLink href="/contact" className="hover:text-brand">Contact</LocalizedClientLink>
            {customer ? (
              <LocalizedClientLink href="/account" className="hover:text-brand">Account</LocalizedClientLink>
            ) : (
              <>
                <LocalizedClientLink href="/account?mode=login" className="hover:text-brand">Log in</LocalizedClientLink>
                <LocalizedClientLink href="/account?mode=register" className="rounded-full bg-brand px-4 py-2 font-medium text-white transition duration-200 hover:-translate-y-0.5 hover:bg-[#b92f2f] active:scale-[0.98]">Sign up</LocalizedClientLink>
              </>
            )}
            {seller && <LocalizedClientLink href="/seller" className="hover:text-brand">Manage Business</LocalizedClientLink>}
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

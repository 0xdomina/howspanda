"use client"

import { useEffect, useState } from "react"
import { createPortal } from "react-dom"

import { ArrowRightMini } from "@medusajs/icons"
import { Text, clx, useToggleState } from "@medusajs/ui"

import { Locale } from "@lib/data/locales"
import { HttpTypes } from "@medusajs/types"
import LocalizedClientLink from "@modules/common/components/localized-client-link"
import X from "@modules/common/icons/x"
import CountrySelect from "../country-select"
import LanguageSelect from "../language-select"
import SearchForm from "@modules/layout/components/search-form"

// Flat aisles that search the marketplace. (The old tree had 36 subcategory
// links that all landed on the same page as their parent — pure noise.)
const marketplaceCategories = [
  { name: "Women's Fashion", href: "/store?q=fashion" },
  { name: "Men's Fashion", href: "/store?q=men" },
  { name: "Electronics", href: "/store?q=electronics" },
  { name: "Home & Lifestyle", href: "/store?q=home" },
  { name: "Health & Beauty", href: "/store?q=beauty" },
  { name: "Sports & Outdoor", href: "/store?q=sports" },
  { name: "Baby & Toys", href: "/store?q=toys" },
  { name: "Groceries & Pets", href: "/store?q=grocery" },
  { name: "Wellness", href: "/store?q=wellness" },
]

// No Wishlist / Account / Cart rows: the nav icon rail already owns those one
// tap away — repeating them here doubles every path for zero benefit.
const menuLinks = [
  ["Mall", "/malls"],
  ["Campaigns", "/challenges"],
  ["Jobs", "/deliver"],
  ["Buyer AI", "/ai"],
] as const

type SideMenuProps = {
  regions: HttpTypes.StoreRegion[] | null
  locales: Locale[] | null
  currentLocale: string | null
  /** Resolved server-side (nav layout) so the browser never calls /store/features. */
  mallsEnabled?: boolean
  isAuthenticated?: boolean
  hasSeller?: boolean
}

const SideMenu = ({ regions, locales, currentLocale, mallsEnabled = false, isAuthenticated = false, hasSeller = false }: SideMenuProps) => {
  const countryToggleState = useToggleState()
  const languageToggleState = useToggleState()
  const [isOpen, setIsOpen] = useState(false)

  useEffect(() => {
    if (!isOpen) return
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsOpen(false)
    }
    document.addEventListener("keydown", closeOnEscape)
    return () => document.removeEventListener("keydown", closeOnEscape)
  }, [isOpen])

  useEffect(() => {
    if (!isOpen) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      document.body.style.overflow = previousOverflow
    }
  }, [isOpen])

  const closeMenu = () => setIsOpen(false)

  return (
    <>
      <button
        type="button"
        data-testid="nav-menu-button"
        aria-label={isOpen ? "Close menu" : "Open menu"}
        aria-expanded={isOpen}
        aria-controls="global-side-menu"
        onClick={() => setIsOpen((open) => !open)}
        className="grid h-10 w-10 place-items-center rounded-full text-ink transition-colors duration-200 hover:bg-paper-tinted active:scale-[0.97]"
      >
        <span className="sr-only">{isOpen ? "Close menu" : "Open menu"}</span>
        {isOpen ? (
          <X size={20} />
        ) : (
          <span className="grid w-5 gap-1" aria-hidden="true">
            <span className="h-0.5 w-5 rounded-full bg-current" />
            <span className="h-0.5 w-5 rounded-full bg-current" />
            <span className="h-0.5 w-5 rounded-full bg-current" />
          </span>
        )}
      </button>

      {isOpen && typeof document !== "undefined"
        ? createPortal(
        <>
          <button
            type="button"
            aria-label="Close menu backdrop"
            data-testid="nav-menu-backdrop"
            onClick={closeMenu}
            className="fixed inset-0 z-[70] bg-ink/20 backdrop-blur-[2px]"
          />
          <aside
            id="global-side-menu"
            data-testid="nav-menu-popup"
            role="dialog"
            aria-modal="true"
            className="soft-glass fixed inset-y-2 left-2 z-[71] flex w-[calc(100%-1rem)] flex-col justify-between rounded-rounded p-6 text-sm text-ink shadow-modal transition-transform duration-200 sm:w-[min(420px,calc(100%-1rem))]"
          >
            <div className="flex min-h-0 flex-col gap-5 overflow-y-auto pr-2">
              <div className="flex items-center justify-between gap-4">
                <p className="font-display text-xl font-medium">Browse</p>
                <button
                  type="button"
                  onClick={closeMenu}
                  aria-label="Close browse menu"
                  data-testid="nav-menu-close"
                  className="grid h-9 w-9 place-items-center rounded-full text-ink transition-colors duration-200 hover:bg-paper-tinted active:scale-[0.97]"
                >
                  <X size={18} />
                </button>
              </div>
              <div className="flex flex-wrap gap-3">
                {isAuthenticated ? (
                  <LocalizedClientLink href="/account" onClick={closeMenu} className="inline-flex items-center justify-center rounded-control border border-ink-hairline bg-white/60 px-5 py-3 font-medium text-ink">My account →</LocalizedClientLink>
                ) : (
                  <>
                    <LocalizedClientLink href="/account?mode=login" onClick={closeMenu} className="inline-flex items-center justify-center rounded-control border border-ink-hairline bg-white/60 px-5 py-3 font-medium text-ink">Log in</LocalizedClientLink>
                    <LocalizedClientLink href="/account?mode=register" onClick={closeMenu} className="figma-button px-5 py-3">Sign up</LocalizedClientLink>
                  </>
                )}
                {hasSeller && <LocalizedClientLink href="/seller" onClick={closeMenu} className="inline-flex items-center justify-center rounded-control border border-ink-hairline bg-white/60 px-5 py-3 font-medium text-ink">Manage Business</LocalizedClientLink>}
              </div>
              <SearchForm inputId="mobile-product-search" className="flex h-10 items-center gap-3 rounded-control bg-[#f5f5f5] px-4 small:hidden" />
              <div>
                <p className="font-display text-3xl leading-10 text-ink">Marketplace</p>
                <div className="mt-4 grid gap-1 border-l border-ink-hairline pl-4">
                  {marketplaceCategories.map((category) => (
                    <LocalizedClientLink
                      key={category.name}
                      href={category.href}
                      onClick={closeMenu}
                      className="py-1.5 text-base font-medium text-ink hover:text-brand"
                    >
                      {category.name}
                    </LocalizedClientLink>
                  ))}
                </div>
              </div>
              <ul className="grid gap-3">
                {menuLinks.filter(([name]) => name !== "Mall" || mallsEnabled).map(([name, href]) => <li key={name}><LocalizedClientLink href={href} onClick={closeMenu} className="font-display text-2xl leading-9 text-ink hover:text-ink-muted">{name}</LocalizedClientLink></li>)}
              </ul>
            </div>
            <div className="mt-6 flex flex-col gap-y-6">
              {!!locales?.length && <div className="flex justify-between" onMouseEnter={languageToggleState.open} onMouseLeave={languageToggleState.close}><LanguageSelect toggleState={languageToggleState} locales={locales} currentLocale={currentLocale} /><ArrowRightMini className={clx("transition-transform duration-150", languageToggleState.state ? "-rotate-90" : "")} /></div>}
              <div className="flex justify-between" onMouseEnter={countryToggleState.open} onMouseLeave={countryToggleState.close}>{regions && <CountrySelect toggleState={countryToggleState} regions={regions} />}<ArrowRightMini className={clx("transition-transform duration-150", countryToggleState.state ? "-rotate-90" : "")} /></div>
              <Text className="flex justify-between txt-compact-small">© {new Date().getFullYear()} How&rsquo;s U.</Text>
            </div>
          </aside>
        </>,
        document.body
      )
        : null}
    </>
  )
}

export default SideMenu

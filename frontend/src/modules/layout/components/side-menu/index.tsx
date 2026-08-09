"use client"

import { useEffect, useState } from "react"

import { ArrowRightMini } from "@medusajs/icons"
import { Text, clx, useToggleState } from "@medusajs/ui"

import { Locale } from "@lib/data/locales"
import { HttpTypes } from "@medusajs/types"
import LocalizedClientLink from "@modules/common/components/localized-client-link"
import X from "@modules/common/icons/x"
import CountrySelect from "../country-select"
import LanguageSelect from "../language-select"
import SearchForm from "@modules/layout/components/search-form"

const marketplaceCategories = [
  { name: "Women's Fashion", href: "/store", subcategories: ["Dresses", "Tops & blouses", "Shoes", "Bags & accessories"] },
  { name: "Men's Fashion", href: "/store", subcategories: ["Shirts", "Trousers", "Shoes", "Watches & accessories"] },
  { name: "Electronics", href: "/categories", subcategories: ["Phones & tablets", "Computers", "Audio", "Cameras"] },
  { name: "Home & Lifestyle", href: "/categories", subcategories: ["Furniture", "Kitchen", "Home decor", "Appliances"] },
  { name: "Medicine", href: "/categories", subcategories: ["First aid", "Wellness", "Personal care", "Medical supplies"] },
  { name: "Sports & Outdoor", href: "/categories", subcategories: ["Fitness", "Team sports", "Outdoor gear", "Sportswear"] },
  { name: "Baby's & Toys", href: "/categories", subcategories: ["Baby clothing", "Toys & games", "Feeding", "Nursery"] },
  { name: "Groceries & Pets", href: "/categories", subcategories: ["Pantry", "Fresh food", "Beverages", "Pet care"] },
  { name: "Health & Beauty", href: "/categories", subcategories: ["Skincare", "Haircare", "Makeup", "Grooming"] },
]

const menuLinks = [
  ["Mall", "/malls"],
  ["Campaigns", "/challenges"],
  ["Jobs", "/deliver"],
  ["Buyer AI", "/demo/ai-chat"],
  ["Wishlist", "/wishlist"],
  ["Account", "/account"],
  ["Cart", "/cart"],
] as const

type SideMenuProps = {
  regions: HttpTypes.StoreRegion[] | null
  locales: Locale[] | null
  currentLocale: string | null
}

const SideMenu = ({ regions, locales, currentLocale }: SideMenuProps) => {
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

      {isOpen && (
        <>
          <button
            type="button"
            aria-label="Close menu"
            onClick={closeMenu}
            className="fixed inset-0 z-[50] bg-ink/20 backdrop-blur-[2px]"
          />
          <aside
            id="global-side-menu"
            data-testid="nav-menu-popup"
            role="dialog"
            aria-modal="true"
            className="soft-glass fixed inset-y-2 left-2 z-[51] flex w-[calc(100%-1rem)] flex-col justify-between rounded-rounded p-6 text-sm text-ink shadow-modal transition-transform duration-200 sm:w-[min(420px,calc(100%-1rem))]"
          >
            <div className="flex min-h-0 flex-col gap-5 overflow-y-auto pr-2">
              <div className="flex items-center justify-between gap-4">
                <p className="font-display text-xl font-medium">Browse</p>
                <button
                  type="button"
                  onClick={closeMenu}
                  aria-label="Close menu"
                  className="grid h-9 w-9 place-items-center rounded-full text-ink transition-colors duration-200 hover:bg-paper-tinted active:scale-[0.97]"
                >
                  <X size={18} />
                </button>
              </div>
              <SearchForm inputId="mobile-product-search" className="flex h-10 items-center gap-3 rounded-control bg-[#f5f5f5] px-4 small:hidden" />
              <details open>
                <summary className="cursor-pointer list-none font-display text-3xl leading-10 text-ink">Marketplace</summary>
                <div className="mt-4 grid gap-3 border-l border-ink-hairline pl-4">
                  {marketplaceCategories.map((category) => (
                    <details key={category.name}>
                      <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-base font-medium text-ink">
                        <LocalizedClientLink href={category.href} onClick={closeMenu}>{category.name}</LocalizedClientLink>
                        <span className="text-ink-muted">›</span>
                      </summary>
                      <div className="mt-2 grid gap-2 pl-3 text-sm text-ink-muted">
                        {category.subcategories.map((subcategory) => <LocalizedClientLink key={subcategory} href={category.href} onClick={closeMenu} className="hover:text-ink">{subcategory}</LocalizedClientLink>)}
                      </div>
                    </details>
                  ))}
                </div>
              </details>
              <ul className="grid gap-3">
                {menuLinks.map(([name, href]) => <li key={name}><LocalizedClientLink href={href} onClick={closeMenu} className="font-display text-2xl leading-9 text-ink hover:text-ink-muted">{name}</LocalizedClientLink></li>)}
              </ul>
            </div>
            <div className="mt-6 flex flex-col gap-y-6">
              {!!locales?.length && <div className="flex justify-between" onMouseEnter={languageToggleState.open} onMouseLeave={languageToggleState.close}><LanguageSelect toggleState={languageToggleState} locales={locales} currentLocale={currentLocale} /><ArrowRightMini className={clx("transition-transform duration-150", languageToggleState.state ? "-rotate-90" : "")} /></div>}
              <div className="flex justify-between" onMouseEnter={countryToggleState.open} onMouseLeave={countryToggleState.close}>{regions && <CountrySelect toggleState={countryToggleState} regions={regions} />}<ArrowRightMini className={clx("transition-transform duration-150", countryToggleState.state ? "-rotate-90" : "")} /></div>
              <Text className="flex justify-between txt-compact-small">© {new Date().getFullYear()} How&rsquo;s U.</Text>
            </div>
          </aside>
        </>
      )}
    </>
  )
}

export default SideMenu

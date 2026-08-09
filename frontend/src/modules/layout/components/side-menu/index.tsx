"use client"

import { ArrowRightMini } from "@medusajs/icons"
import { Text, clx, useToggleState } from "@medusajs/ui"

import LocalizedClientLink from "@modules/common/components/localized-client-link"
import CountrySelect from "../country-select"
import LanguageSelect from "../language-select"
import SearchForm from "@modules/layout/components/search-form"
import { HttpTypes } from "@medusajs/types"
import { Locale } from "@lib/data/locales"

const marketplaceCategories = [
  { name: "Woman’s Fashion", href: "/store", subcategories: ["Dresses", "Tops & blouses", "Shoes", "Bags & accessories"] },
  { name: "Men’s Fashion", href: "/store", subcategories: ["Shirts", "Trousers", "Shoes", "Watches & accessories"] },
  { name: "Electronics", href: "/categories", subcategories: ["Phones & tablets", "Computers", "Audio", "Cameras"] },
  { name: "Home & Lifestyle", href: "/categories", subcategories: ["Furniture", "Kitchen", "Home decor", "Appliances"] },
  { name: "Medicine", href: "/categories", subcategories: ["First aid", "Wellness", "Personal care", "Medical supplies"] },
  { name: "Sports & Outdoor", href: "/categories", subcategories: ["Fitness", "Team sports", "Outdoor gear", "Sportswear"] },
  { name: "Baby’s & Toys", href: "/categories", subcategories: ["Baby clothing", "Toys & games", "Feeding", "Nursery"] },
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

  return (
    <details className="relative h-full">
      <summary data-testid="nav-menu-button" className="flex h-full cursor-pointer list-none items-center transition-colors hover:text-brand">Menu</summary>
      <aside id="global-side-menu" data-testid="nav-menu-popup" className="soft-glass fixed inset-y-2 left-2 z-[51] flex w-[calc(100%-1rem)] flex-col justify-between rounded-rounded p-6 text-sm text-ink shadow-modal sm:w-[min(420px,calc(100%-1rem))]">
        <div className="flex min-h-0 flex-col gap-5 overflow-y-auto pr-2">
          <SearchForm inputId="mobile-product-search" className="flex h-10 items-center gap-3 rounded-control bg-[#f5f5f5] px-4 small:hidden" />
          <details open>
            <summary className="cursor-pointer list-none font-display text-3xl leading-10 text-ink">Marketplace</summary>
            <div className="mt-4 grid gap-3 border-l border-ink-hairline pl-4">
              {marketplaceCategories.map((category) => (
                <details key={category.name}>
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-base font-medium text-ink">
                    <LocalizedClientLink href={category.href}>{category.name}</LocalizedClientLink>
                    <span className="text-ink-muted">›</span>
                  </summary>
                  <div className="mt-2 grid gap-2 pl-3 text-sm text-ink-muted">
                    {category.subcategories.map((subcategory) => <LocalizedClientLink key={subcategory} href={category.href} className="hover:text-ink">{subcategory}</LocalizedClientLink>)}
                  </div>
                </details>
              ))}
            </div>
          </details>
          <ul className="grid gap-3">
            {menuLinks.map(([name, href]) => <li key={name}><LocalizedClientLink href={href} className="font-display text-2xl leading-9 text-ink hover:text-ink-muted">{name}</LocalizedClientLink></li>)}
          </ul>
        </div>
        <div className="mt-6 flex flex-col gap-y-6">
          {!!locales?.length && <div className="flex justify-between" onMouseEnter={languageToggleState.open} onMouseLeave={languageToggleState.close}><LanguageSelect toggleState={languageToggleState} locales={locales} currentLocale={currentLocale} /><ArrowRightMini className={clx("transition-transform duration-150", languageToggleState.state ? "-rotate-90" : "")} /></div>}
          <div className="flex justify-between" onMouseEnter={countryToggleState.open} onMouseLeave={countryToggleState.close}>{regions && <CountrySelect toggleState={countryToggleState} regions={regions} />}<ArrowRightMini className={clx("transition-transform duration-150", countryToggleState.state ? "-rotate-90" : "")} /></div>
          <Text className="flex justify-between txt-compact-small">© {new Date().getFullYear()} How&rsquo;s u.</Text>
        </div>
      </aside>
    </details>
  )
}

export default SideMenu

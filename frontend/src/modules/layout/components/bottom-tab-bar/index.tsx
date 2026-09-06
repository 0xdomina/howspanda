"use client"

import { usePathname } from "next/navigation"

import LocalizedClientLink from "@modules/common/components/localized-client-link"

const TABS = [
  { href: "/", label: "Home", icon: "⌂" },
  { href: "/store", label: "Shop", icon: "▦" },
  { href: "/seller", label: "Sell", icon: "+" },
  { href: "/wishlist", label: "Saved", icon: "♡" },
  { href: "/account", label: "You", icon: "♙" },
] as const

// Thumb-zone navigation for phones (the marketplace pattern: Jumia, Konga,
// Shopee). Mobile only — desktop keeps the top nav. Active tab is derived
// from the pathname so it never lies about where you are.
export default function BottomTabBar() {
  const pathname = usePathname() ?? ""
  const stripped = pathname.replace(/^\/[a-z]{2}(?=\/|$)/, "") || "/"

  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-50 border-t border-ink-hairline bg-white/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-md small:hidden"
    >
      <ul className="grid grid-cols-5">
        {TABS.map((tab) => {
          const active =
            tab.href === "/" ? stripped === "/" : stripped.startsWith(tab.href)
          return (
            <li key={tab.href}>
              <LocalizedClientLink
                href={tab.href}
                aria-current={active ? "page" : undefined}
                className={
                  "flex flex-col items-center gap-0.5 py-2 text-[11px] transition-colors " +
                  (active ? "font-semibold text-ink" : "text-ink-muted")
                }
              >
                <span aria-hidden="true" className="text-lg leading-none">
                  {tab.icon}
                </span>
                {tab.label}
                <span
                  aria-hidden="true"
                  className={
                    "h-1 w-6 rounded-full " + (active ? "bg-brand" : "bg-transparent")
                  }
                />
              </LocalizedClientLink>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}

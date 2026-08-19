"use client"

import { useParams, usePathname } from "next/navigation"

import { sellerSignout } from "@lib/data/seller"
import LocalizedClientLink from "@modules/common/components/localized-client-link"
import { sellerHasPermission, type SellerPermission } from "@lib/seller-permissions"

type SellerNavSeller = {
  role?: "owner" | "staff"
  permissions?: SellerPermission[]
}

const primaryLinks = [
  ["/seller", "Home", null],
  ["/seller/products/new", "Create", "products"],
  ["/seller/orders", "Orders", "orders"],
  ["/seller/requests", "Inbox", "requests"],
  ["/seller/settings", "Store", null],
] as const

const manageLinks = [
  ["/seller/products", "Products", "products"],
  ["/seller/analytics", "Analytics", "analytics"],
  ["/seller/followers", "Followers", "followers"],
  ["/seller/money", "Money", "owner"],
  ["/seller/delivery", "Delivery", "delivery"],
  ["/seller/reviews", "Reviews", "reviews"],
  ["/seller/referrals", "Referrals", "referrals"],
  ["/seller/redeemables", "Redeemables", "redeemables"],
  ["/seller/team", "Team", "owner"],
  ["/seller/ai", "Seller AI", "ai"],
  ["/seller/broadcasts", "Updates", "broadcasts"],
] as const

export default function SellerNav({ seller }: { seller: SellerNavSeller }) {
  const route = usePathname()
  const { countryCode } = useParams() as { countryCode: string }

  const handleLogout = async () => sellerSignout(countryCode)
  const active = (href: string) =>
    href === "/seller" ? route.endsWith("/seller") : route.includes(href)
  const manageOpen = manageLinks.some(([href]) => active(href))

  return (
    <nav className="seller-nav rounded-[22px] p-3 small:sticky small:top-28" data-testid="seller-nav">
      <div className="grid grid-cols-5 gap-1 pb-1 small:grid-cols-1 small:gap-1">
        {primaryLinks.map(([href, label, permission]) => {
          if (permission && !sellerHasPermission(seller, permission)) return null
          return (
            <LocalizedClientLink
              key={href}
              href={href}
              className={`min-w-0 rounded-xl px-1 py-2.5 text-center text-xs transition-colors duration-fast small:px-3 small:text-left small:text-sm ${active(href) ? "bg-ink text-white shadow-sm" : "text-ink-muted hover:bg-white/70 hover:text-ink"}`}
            >
              {label}
            </LocalizedClientLink>
          )
        })}
      </div>
      <details open={manageOpen} className="mt-4 border-t border-black/10 pt-4">
        <summary className="cursor-pointer list-none rounded-xl px-3 py-2 text-sm font-semibold text-ink hover:bg-white/60">Business tools</summary>
        <div className="mt-2 grid gap-1 pl-1">
          {manageLinks.map(([href, label, permission]) => {
            const allowed =
              permission === "owner"
                ? seller.role === "owner"
                : sellerHasPermission(seller, permission)
            if (!allowed) return null
            return (
              <LocalizedClientLink
                key={href}
                href={href}
                className={`rounded-xl px-3 py-2 text-sm transition-colors duration-fast ${active(href) ? "bg-white/80 font-semibold text-ink shadow-sm" : "text-ink-muted hover:bg-white/60 hover:text-ink"}`}
              >
                {label}
              </LocalizedClientLink>
            )
          })}
        </div>
      </details>
      <button type="button" onClick={handleLogout} className="mt-5 w-full rounded-xl px-3 py-2 text-left text-sm text-ink-muted transition-colors duration-fast hover:bg-white/60 hover:text-ink">
        Log out
      </button>
    </nav>
  )
}

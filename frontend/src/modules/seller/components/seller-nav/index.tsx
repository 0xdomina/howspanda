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
  ["/seller/broadcasts", "Inbox", "broadcasts"],
  ["/seller/settings", "Profile", null],
] as const

const manageLinks = [
  ["/seller/products", "Products", "products"],
  ["/seller/analytics", "Analytics", "analytics"],
  ["/seller/followers", "Followers", "followers"],
  ["/seller/money", "Money", "owner"],
  ["/seller/malls", "Malls", "malls"],
  ["/seller/delivery", "Delivery", "delivery"],
  ["/seller/reviews", "Reviews", "reviews"],
  ["/seller/referrals", "Referrals", "referrals"],
  ["/seller/redeemables", "Redeemables", "redeemables"],
  ["/seller/team", "Team", "owner"],
  ["/seller/ai", "Seller AI", "ai"],
] as const

export default function SellerNav({ seller }: { seller: SellerNavSeller }) {
  const route = usePathname()
  const { countryCode } = useParams() as { countryCode: string }

  const handleLogout = async () => sellerSignout(countryCode)
  const active = (href: string) => route.split(countryCode)[1] === href

  return (
    <nav className="small:sticky small:top-28" data-testid="seller-nav">
      <div className="flex gap-2 overflow-x-auto pb-4 small:grid small:gap-1">
        {primaryLinks.map(([href, label, permission]) => {
          if (permission && !sellerHasPermission(seller, permission)) return null
          return (
            <LocalizedClientLink key={href} href={href} className={`whitespace-nowrap rounded-full px-4 py-2 text-sm transition-colors ${active(href) ? "bg-ink text-white" : "text-ink-muted hover:bg-paper-tinted hover:text-ink"}`}>
              {label}
            </LocalizedClientLink>
          )
        })}
      </div>
      <details className="mt-4 border-t border-ink-hairline pt-4">
        <summary className="cursor-pointer list-none text-sm font-semibold text-ink">Manage business</summary>
        <div className="mt-3 grid gap-1 pl-2">
          {manageLinks.map(([href, label, permission]) => {
            const allowed =
              permission === "owner"
                ? seller.role === "owner"
                : sellerHasPermission(seller, permission)
            if (!allowed) return null
            return <LocalizedClientLink key={href} href={href} className={`rounded px-3 py-2 text-sm ${active(href) ? "bg-paper-tinted font-semibold text-ink" : "text-ink-muted hover:text-ink"}`}>{label}</LocalizedClientLink>
          })}
        </div>
      </details>
      <button type="button" onClick={handleLogout} className="mt-5 px-4 text-sm text-ink-muted hover:text-ink">Log out</button>
    </nav>
  )
}

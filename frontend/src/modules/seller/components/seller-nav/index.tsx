"use client"

import { clx } from "@medusajs/ui"
import { useParams, usePathname } from "next/navigation"

import LocalizedClientLink from "@modules/common/components/localized-client-link"
import { sellerSignout } from "@lib/data/seller"

const SellerNav = () => {
  const route = usePathname()
  const { countryCode } = useParams() as { countryCode: string }

  const handleLogout = async () => {
    await sellerSignout(countryCode)
  }

  const links = [
    { href: "/seller", label: "Overview" },
    { href: "/seller/products", label: "Products" },
    { href: "/seller/orders", label: "Orders" },
    { href: "/seller/money", label: "Money" },
    { href: "/seller/malls", label: "Malls" },
    { href: "/seller/delivery", label: "Delivery" },
  ]

  return (
    <div className="hidden small:block" data-testid="seller-nav">
      <div>
        <div className="pb-4">
          <h3 className="text-base-semi text-ink">Store</h3>
        </div>
        <div className="text-base-regular">
          <ul className="flex mb-0 justify-start items-start flex-col gap-y-4">
            {links.map((link) => {
              const active = route.split(countryCode)[1] === link.href
              return (
                <li key={link.href}>
                  <LocalizedClientLink
                    href={link.href}
                    className={clx("text-ink-muted hover:text-ink", {
                      "text-ink font-semibold": active,
                    })}
                  >
                    {link.label}
                  </LocalizedClientLink>
                </li>
              )
            })}
            <li className="text-ink-muted">
              <button type="button" onClick={handleLogout}>
                Log out
              </button>
            </li>
          </ul>
        </div>
      </div>
    </div>
  )
}

export default SellerNav
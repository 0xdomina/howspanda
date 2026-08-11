import React from "react"

import LocalizedClientLink from "@modules/common/components/localized-client-link"
import SellerNav from "../components/seller-nav"
import type { SellerPermission } from "@lib/seller-permissions"

interface SellerLayoutProps {
  seller: {
    name?: string
    first_name?: string
    last_name?: string
    handle?: string
    role?: "owner" | "staff"
    permissions?: SellerPermission[]
  } | null
  children: React.ReactNode
}

const SellerLayout: React.FC<SellerLayoutProps> = ({ seller, children }) => {
  const canCreate = seller?.role === "owner" || seller?.permissions?.includes("products")

  return (
    <div className="seller-workspace flex-1 py-6 small:py-12" data-testid="seller-page">
      <div className="figma-container">
        <div className="seller-shell-header mb-6 flex flex-col gap-5 rounded-[24px] p-5 small:mb-8 small:flex-row small:items-center small:justify-between small:p-7">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-brand">Manage Business</p>
            <h1 className="mt-2 font-display text-4xl font-semibold tracking-tight text-ink">Your store</h1>
            <p className="mt-2 text-sm text-ink-muted">{seller?.name ?? seller?.first_name ?? "Your business on How’s U"}</p>
          </div>
          {canCreate && (
            <LocalizedClientLink href="/seller/products/new" className="figma-button w-full small:w-auto">
              Create a post
            </LocalizedClientLink>
          )}
        </div>
        <div className="grid grid-cols-1 gap-6 small:grid-cols-[220px_1fr] small:gap-8">
          <div>{seller && <SellerNav seller={seller} />}</div>
          <div className="min-w-0">{children}</div>
        </div>
      </div>
    </div>
  )
}

export default SellerLayout

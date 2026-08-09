import React from "react"

import SellerNav from "../components/seller-nav"

interface SellerLayoutProps {
  seller: {
    name?: string
    first_name?: string
    last_name?: string
    handle?: string
  } | null
  children: React.ReactNode
}

const SellerLayout: React.FC<SellerLayoutProps> = ({ seller, children }) => {
  return (
    <div className="flex-1 bg-[#fafafa] py-6 small:py-12" data-testid="seller-page">
      <div className="figma-container">
        <div className="mb-8 flex flex-col gap-2 small:mb-10 small:flex-row small:items-end small:justify-between">
          <div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-brand">Sell layer</p><h1 className="mt-2 font-display text-4xl font-semibold tracking-tight text-ink">Your store</h1></div>
          <p className="text-sm text-ink-muted">{seller?.name ?? seller?.first_name ?? "Your business on How’s U"}</p>
        </div>
        <div className="grid grid-cols-1 gap-8 small:grid-cols-[180px_1fr] small:gap-12"><div>{seller && <SellerNav />}</div><div className="min-w-0">{children}</div></div>
      </div>
    </div>
  )
}

export default SellerLayout

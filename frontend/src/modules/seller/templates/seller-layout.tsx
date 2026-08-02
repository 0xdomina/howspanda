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
    <div className="flex-1 small:py-12" data-testid="seller-page">
      <div className="content-container max-w-6xl mx-auto">
        <div className="py-8">
          <h1 className="font-display text-3xl font-medium tracking-[-0.02em] text-ink">
            Your store
          </h1>
          <p className="mt-2 text-sm text-ink-muted">
            {seller?.name ?? seller?.first_name ?? "Manage your products and orders."}
          </p>
        </div>
        <div className="grid grid-cols-1 small:grid-cols-[220px_1fr] gap-8 small:gap-12">
          <div>{seller && <SellerNav />}</div>
          <div className="flex-1">{children}</div>
        </div>
      </div>
    </div>
  )
}

export default SellerLayout
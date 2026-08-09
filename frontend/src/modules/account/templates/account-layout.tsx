import React from "react"

import UnderlineLink from "@modules/common/components/interactive-link"

import AccountNav from "../components/account-nav"
import { HttpTypes } from "@medusajs/types"

interface AccountLayoutProps {
  customer: HttpTypes.StoreCustomer | null
  children: React.ReactNode
}

const AccountLayout: React.FC<AccountLayoutProps> = ({
  customer,
  children,
}) => {
  return (
    <div className="flex-1 bg-white py-6 small:py-12" data-testid="account-page">
      <div className="figma-container flex h-full flex-col">
        <div className="mb-10">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-brand">Account</p>
          <h1 className="mt-2 font-display text-4xl font-semibold tracking-tight text-ink">Welcome back</h1>
        </div>
        <div className="grid grid-cols-1 gap-8 small:grid-cols-[220px_1fr] small:gap-12">
          <div>{customer && <AccountNav customer={customer} />}</div>
          <div className="min-w-0 rounded-control border border-ink-hairline bg-white p-6 small:p-10">{children}</div>
        </div>
      </div>
    </div>
  )
}

export default AccountLayout

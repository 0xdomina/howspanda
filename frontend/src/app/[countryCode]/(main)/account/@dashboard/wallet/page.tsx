import { Metadata } from "next"

import { retrieveCustomer } from "@lib/data/customer"
import { getPaymentRails } from "@lib/data/payment-rails"
import { notFound } from "next/navigation"

import WalletClient from "@modules/account/components/wallet"
import {
  getBuyerWallet,
  listWithdrawalAccounts,
  listWithdrawals,
} from "@lib/data/wallet"

export const metadata: Metadata = {
  title: "Wallet",
  description: "Your wallet balance, ledger and withdrawals.",
}

export default async function WalletPage() {
  const customer = await retrieveCustomer().catch(() => null)

  if (!customer?.email) {
    notFound()
  }

  const [wallet, accounts, withdrawals, rails] = await Promise.all([
    getBuyerWallet(customer.email),
    listWithdrawalAccounts(customer.email),
    listWithdrawals(customer.email),
    getPaymentRails().catch(() => []),
  ])

  // Only surface withdrawal rails that are toggled ON (admin-runtime switch).
  const enabledRails = rails.filter((r) => r.enabled).map((r) => r.key)

  return (
    <WalletClient
      email={customer.email}
      balance={wallet?.balance ?? 0}
      minimum={wallet?.minimum_ngn ?? 0}
      ledger={wallet?.ledger ?? []}
      accounts={accounts}
      withdrawals={withdrawals}
      enabledRails={enabledRails}
    />
  )
}
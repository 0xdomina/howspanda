import { Metadata } from "next"

import { retrieveCustomer } from "@lib/data/customer"
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

  const [wallet, accounts, withdrawals] = await Promise.all([
    getBuyerWallet(customer.email),
    listWithdrawalAccounts(customer.email),
    listWithdrawals(customer.email),
  ])

  return (
    <WalletClient
      email={customer.email}
      balance={wallet?.balance ?? 0}
      minimum={wallet?.minimum_ngn ?? 0}
      ledger={wallet?.ledger ?? []}
      accounts={accounts}
      withdrawals={withdrawals}
    />
  )
}
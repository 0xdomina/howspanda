import { Metadata } from "next"

import { retrieveCustomer } from "@lib/data/customer"
import { getEnabledRailKeys, getPaymentRails } from "@lib/data/payment-rails"
import { notFound } from "next/navigation"

import WalletClient from "@modules/account/components/wallet"
import CryptoWallet from "@modules/account/components/wallet/crypto-wallet"
import {
  getBuyerWallet,
  listWithdrawalAccounts,
  listWithdrawals,
} from "@lib/data/wallet"
import { getCryptoWallet } from "@lib/data/crypto-wallet"

export const metadata: Metadata = {
  title: "Wallet",
  description: "Your wallet balance, ledger and withdrawals.",
}

export default async function WalletPage() {
  const customer = await retrieveCustomer().catch(() => null)

  if (!customer?.email) {
    notFound()
  }

  const [wallet, accounts, withdrawals, rails, cryptoWallet] = await Promise.all([
    getBuyerWallet(customer.email),
    listWithdrawalAccounts(customer.email),
    listWithdrawals(customer.email),
    getPaymentRails().catch(() => []),
    getCryptoWallet(),
  ])

  // Only surface withdrawal rails that are toggled ON (admin-runtime switch).
  // An empty rails list (fetch failure) keeps every rail available.
  const enabledRails = getEnabledRailKeys(rails)

  return (
    <div className="space-y-6">
      <CryptoWallet initial={cryptoWallet} />
      <WalletClient
        email={customer.email}
        balance={wallet?.balance ?? 0}
        minimum={wallet?.minimum_ngn ?? 0}
        ledger={wallet?.ledger ?? []}
        accounts={accounts}
        withdrawals={withdrawals}
        enabledRails={enabledRails}
      />
    </div>
  )
}
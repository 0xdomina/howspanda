import { Metadata } from "next"
import { notFound } from "next/navigation"

import {
  retrieveSeller,
  retrieveSellerBalance,
  retrieveSellerCommissions,
  listPayoutAccounts,
  listSellerPayouts,
} from "@lib/data/seller"
import SellerMoneyClient from "@modules/seller/templates/seller-money"

export const metadata: Metadata = {
  title: "Money",
  description: "Your store balance, commissions, payout accounts and payout history.",
}

export default async function SellerMoneyPage() {
  const seller = await retrieveSeller().catch(() => null)
  const balance = await retrieveSellerBalance().catch(() => null)
  const commissions = await retrieveSellerCommissions().catch(() => null)
  const payoutAccounts = await listPayoutAccounts().catch(() => [])
  const payouts = await listSellerPayouts().catch(() => [])

  if (!seller) {
    notFound()
  }

  return (
    <SellerMoneyClient
      balance={balance}
      commissions={commissions}
      payoutAccounts={payoutAccounts}
      payouts={payouts}
    />
  )
}

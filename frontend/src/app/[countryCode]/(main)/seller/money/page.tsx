import { Metadata } from "next"
import { notFound } from "next/navigation"

import {
  retrieveSeller,
  retrieveSellerBalance,
  listPayoutAccounts,
  listSellerPayouts,
} from "@lib/data/seller"
import SellerMoneyClient from "@modules/seller/templates/seller-money"

export const metadata: Metadata = {
  title: "Money",
  description: "Your store balance, payout accounts and payout history.",
}

export default async function SellerMoneyPage() {
  const seller = await retrieveSeller().catch(() => null)
  const balance = await retrieveSellerBalance().catch(() => null)
  const payoutAccounts = await listPayoutAccounts().catch(() => [])
  const payouts = await listSellerPayouts().catch(() => [])

  if (!seller) {
    notFound()
  }

  return (
    <SellerMoneyClient
      balance={balance}
      payoutAccounts={payoutAccounts}
      payouts={payouts}
    />
  )
}

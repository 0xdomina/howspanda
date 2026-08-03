import { Metadata } from "next"
import { notFound } from "next/navigation"

import { retrieveSeller, listSellerRedeemables } from "@lib/data/seller"
import RedeemablesClient from "@modules/seller/templates/seller-redeemables"

export const metadata: Metadata = {
  title: "Redeemables",
  description: "Manage gift cards, vouchers and tickets for your store.",
}

export default async function SellerRedeemablesPage() {
  const seller = await retrieveSeller().catch(() => null)

  if (!seller) {
    notFound()
  }

  const redeemables = await listSellerRedeemables().catch(() => [])

  return <RedeemablesClient redeemables={redeemables} />
}
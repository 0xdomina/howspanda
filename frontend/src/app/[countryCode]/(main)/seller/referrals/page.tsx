import { Metadata } from "next"
import { notFound } from "next/navigation"

import { retrieveSeller, listSellerReferrals } from "@lib/data/seller"
import ReferralsClient from "@modules/seller/templates/seller-referrals"
import { sellerHasPermission } from "@lib/seller-permissions"

export const metadata: Metadata = {
  title: "Referrals",
  description: "Invite buyers and earn referral rewards.",
}

export default async function SellerReferralsPage() {
  const seller = await retrieveSeller().catch(() => null)

  if (!seller || !sellerHasPermission(seller, "referrals")) {
    notFound()
  }

  const data = await listSellerReferrals().catch(() => null)

  return (
    <ReferralsClient
      referrals={data?.referrals ?? []}
      stats={
        data?.stats ?? { count: 0, qualified_count: 0, lifetime_earned: 0 }
      }
    />
  )
}

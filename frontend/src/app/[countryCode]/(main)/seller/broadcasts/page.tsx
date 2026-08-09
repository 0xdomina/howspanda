import { Metadata } from "next"
import { notFound } from "next/navigation"

import { retrieveSeller } from "@lib/data/seller"
import { getSellerFollowers } from "@lib/data/follows"
import SellerBroadcastsClient from "@modules/seller/templates/seller-broadcasts"
import { sellerHasPermission } from "@lib/seller-permissions"

export const metadata: Metadata = {
  title: "Broadcasts",
  description: "Send in-app updates, offers, vouchers and giveaways to your followers.",
}

export default async function SellerBroadcastsPage() {
  const seller = await retrieveSeller().catch(() => null)
  if (!seller || !sellerHasPermission(seller, "broadcasts")) {
    notFound()
  }

  const data = await getSellerFollowers().catch(() => null)

  return (
    <SellerBroadcastsClient
      broadcasts={data?.broadcasts ?? []}
      remaining={data?.remaining_this_week ?? 3}
      followerCount={data?.follower_count ?? 0}
      allowVoucher={seller.role !== "staff"}
    />
  )
}

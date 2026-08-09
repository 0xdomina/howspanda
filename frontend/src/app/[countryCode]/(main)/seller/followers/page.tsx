import { Metadata } from "next"
import { notFound } from "next/navigation"

import { retrieveSeller } from "@lib/data/seller"
import { getSellerFollowers } from "@lib/data/follows"
import SellerFollowersClient from "@modules/seller/templates/seller-followers"
import { sellerHasPermission } from "@lib/seller-permissions"

export const metadata: Metadata = {
  title: "Followers",
  description: "See how many people follow your store and how your updates land.",
}

export default async function SellerFollowersPage() {
  const seller = await retrieveSeller().catch(() => null)
  if (!seller || !sellerHasPermission(seller, "followers")) {
    notFound()
  }

  const data = await getSellerFollowers().catch(() => null)

  return (
    <SellerFollowersClient
      followerCount={data?.follower_count ?? 0}
      remaining={data?.remaining_this_week ?? 3}
      broadcasts={data?.broadcasts ?? []}
    />
  )
}

import { Metadata } from "next"
import { notFound } from "next/navigation"

import { retrieveSeller, listSellerTeam } from "@lib/data/seller"
import SellerTeamClient from "@modules/seller/templates/seller-team"

export const metadata: Metadata = {
  title: "Store team",
  description: "Manage the people who can run your store.",
}

export default async function SellerTeamPage() {
  const seller = await retrieveSeller().catch(() => null)
  if (!seller || seller.role === "staff") {
    notFound()
  }

  const team = await listSellerTeam().catch(() => [])
  const isOwner = true

  return (
    <SellerTeamClient
      team={team}
      isOwner={isOwner}
      currentAdminId={seller.id}
    />
  )
}

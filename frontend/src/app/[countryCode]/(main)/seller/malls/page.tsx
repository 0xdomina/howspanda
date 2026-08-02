import { Metadata } from "next"
import { notFound } from "next/navigation"

import { retrieveSeller } from "@lib/data/seller"
import { listSellerMalls } from "@lib/data/mall"
import SellerMallsClient from "@modules/seller/templates/seller-malls"

export const metadata: Metadata = {
  title: "Malls",
  description: "Create and join community sales events.",
}

export default async function SellerMallsPage() {
  const seller = await retrieveSeller().catch(() => null)
  const malls = await listSellerMalls().catch(() => [])

  if (!seller) {
    notFound()
  }

  return <SellerMallsClient malls={malls} />
}

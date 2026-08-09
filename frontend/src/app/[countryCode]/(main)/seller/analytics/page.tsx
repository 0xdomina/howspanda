import { Metadata } from "next"
import { notFound } from "next/navigation"

import { retrieveSeller, retrieveSellerAnalytics } from "@lib/data/seller"
import SellerAnalytics from "@modules/seller/templates/seller-analytics"
import { sellerHasPermission } from "@lib/seller-permissions"

export const metadata: Metadata = {
  title: "Analytics",
  description: "Sales trends, product performance and your store's sales journal.",
}

export default async function SellerAnalyticsPage() {
  const seller = await retrieveSeller().catch(() => null)
  const analytics = await retrieveSellerAnalytics().catch(() => null)

  if (!seller || !sellerHasPermission(seller, "analytics")) {
    notFound()
  }

  return <SellerAnalytics seller={seller} analytics={analytics} />
}

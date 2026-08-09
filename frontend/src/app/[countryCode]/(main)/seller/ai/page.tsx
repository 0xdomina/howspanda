import { Metadata } from "next"
import { notFound } from "next/navigation"

import {
  retrieveSeller,
  getSellerAiQuota,
  getSellerBrief,
} from "@lib/data/seller"
import SellerAiClient from "@modules/seller/templates/seller-ai"
import { sellerHasPermission } from "@lib/seller-permissions"

export const metadata: Metadata = {
  title: "AI tools",
  description: "Briefs, recommendations, marketing and more for your store.",
}

export default async function SellerAiPage() {
  const seller = await retrieveSeller().catch(() => null)

  if (!seller || !sellerHasPermission(seller, "ai")) {
    notFound()
  }

  const [quota, brief] = await Promise.all([
    getSellerAiQuota().catch(() => null),
    getSellerBrief("daily").catch(() => null),
  ])

  return (
    <SellerAiClient quota={quota} brief={brief?.brief ?? null} />
  )
}

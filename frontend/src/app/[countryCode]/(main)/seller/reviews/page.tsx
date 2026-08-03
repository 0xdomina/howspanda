import { Metadata } from "next"
import { notFound } from "next/navigation"

import { retrieveSeller, listSellerReviews } from "@lib/data/seller"
import ReviewsClient from "@modules/seller/templates/seller-reviews"

export const metadata: Metadata = {
  title: "Reviews",
  description: "What buyers are saying about your store.",
}

export default async function SellerReviewsPage() {
  const seller = await retrieveSeller().catch(() => null)

  if (!seller) {
    notFound()
  }

  const reviews = await listSellerReviews().catch(() => [])

  return <ReviewsClient reviews={reviews} />
}

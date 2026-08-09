import "server-only"

import { sdk } from "@lib/config"

export type ProductReview = {
  id: string
  rating: number
  comment: string | null
  reply_body: string | null
  created_at: string
  name: string
}

export type ProductRatingSummary = {
  average: number
  count: number
  reviews: ProductReview[]
}

export const retrieveProductRatingSummary = async (
  productId: string
): Promise<ProductRatingSummary> => {
  try {
    return await sdk.client
      .fetch<ProductRatingSummary>(`/store/products/${productId}/ratings`, {
        method: "GET",
        cache: "no-store",
      })
      .then((summary) => ({
        average: Number(summary.average ?? 0),
        count: Number(summary.count ?? 0),
        reviews: summary.reviews ?? [],
      }))
      .catch(() => ({ average: 0, count: 0, reviews: [] }))
  } catch {
    return { average: 0, count: 0, reviews: [] }
  }
}

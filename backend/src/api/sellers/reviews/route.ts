import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { MedusaError } from "@medusajs/framework/utils"
import { REVIEWS_MODULE } from "../../../modules/reviews"
import type ReviewsModuleService from "../../../modules/reviews/service"
import { resolveSellerId } from "../../../lib/reviews/resolve-seller"
import { requireSellerPermission } from "../../../lib/sellers/resolve-seller"

export const GET = async (
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) => {
  await requireSellerPermission(req, "reviews")
  const sellerId = await resolveSellerId(req)
  const reviews = req.scope.resolve<ReviewsModuleService>(REVIEWS_MODULE)

  const filters: Record<string, unknown> = { seller_id: sellerId }
  if (typeof req.query.rating === "string") {
    // Guard the read path: garbage (?rating=abc) would reach the ORM as NaN
    // (500), and ?rating= as 0 (silent wrong answer). Same 1–5 rule the
    // service enforces on writes.
    const rating = Number(req.query.rating)
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "rating must be an integer between 1 and 5"
      )
    }
    filters.rating = rating
  }
  if (req.query.replied === "true") filters.reply_body = { $ne: null }
  if (req.query.replied === "false") filters.reply_body = null

  const items = await reviews.listReviews(filters, {
    order: { created_at: "DESC" },
  })
  res.json({ reviews: items })
}

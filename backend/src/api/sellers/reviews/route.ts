import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { REVIEWS_MODULE } from "../../../modules/reviews"
import type ReviewsModuleService from "../../../modules/reviews/service"
import { resolveSellerId } from "../../../lib/reviews/resolve-seller"

export const GET = async (
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) => {
  const sellerId = await resolveSellerId(req)
  const reviews = req.scope.resolve<ReviewsModuleService>(REVIEWS_MODULE)

  const filters: Record<string, unknown> = { seller_id: sellerId }
  if (typeof req.query.rating === "string") {
    filters.rating = Number(req.query.rating)
  }
  if (req.query.replied === "true") filters.reply_body = { $ne: null }
  if (req.query.replied === "false") filters.reply_body = null

  const items = await reviews.listReviews(filters, {
    order: { created_at: "DESC" },
  })
  res.json({ reviews: items })
}

import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { z } from "@medusajs/framework/zod"
import { REVIEWS_MODULE } from "../../../../../modules/reviews"
import type ReviewsModuleService from "../../../../../modules/reviews/service"
import { resolveSellerId } from "../../../../../lib/reviews/resolve-seller"
import { PostReviewReplySchema } from "../../../../middlewares"
import { requireSellerPermission } from "../../../../../lib/sellers/resolve-seller"

type Body = z.infer<typeof PostReviewReplySchema>

export const POST = async (
  req: AuthenticatedMedusaRequest<Body>,
  res: MedusaResponse
) => {
  await requireSellerPermission(req, "reviews")
  const sellerId = await resolveSellerId(req)
  const reviews = req.scope.resolve<ReviewsModuleService>(REVIEWS_MODULE)
  const review = await reviews.replyToReview(
    req.params.id,
    sellerId,
    req.validatedBody.body
  )
  res.json({ review })
}

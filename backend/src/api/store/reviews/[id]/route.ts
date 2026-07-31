import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { z } from "@medusajs/framework/zod"
import { REVIEWS_MODULE } from "../../../../modules/reviews"
import type ReviewsModuleService from "../../../../modules/reviews/service"
import {
  DeleteReviewSchema,
  PostEditReviewSchema,
} from "../../../middlewares"

type EditBody = z.infer<typeof PostEditReviewSchema>
type DeleteBody = z.infer<typeof DeleteReviewSchema>

// Buyer edits inside the window (email = ownership proof).
export const POST = async (
  req: MedusaRequest<EditBody>,
  res: MedusaResponse
) => {
  const { email, rating, comment } = req.validatedBody
  const reviews = req.scope.resolve<ReviewsModuleService>(REVIEWS_MODULE)
  const review = await reviews.editReview(req.params.id, email, {
    rating,
    comment,
  })
  res.json({ review })
}

export const DELETE = async (
  req: MedusaRequest<DeleteBody>,
  res: MedusaResponse
) => {
  const { email } = req.validatedBody
  const reviews = req.scope.resolve<ReviewsModuleService>(REVIEWS_MODULE)
  await reviews.deleteOwnedReview(req.params.id, email)
  res.json({ id: req.params.id, deleted: true })
}

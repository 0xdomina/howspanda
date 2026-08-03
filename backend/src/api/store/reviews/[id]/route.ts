import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { z } from "@medusajs/framework/zod"
import { REVIEWS_MODULE } from "../../../../modules/reviews"
import type ReviewsModuleService from "../../../../modules/reviews/service"
import {
  DeleteReviewSchema,
  PostEditReviewSchema,
} from "../../../middlewares"
import { resolveAuthoritativeEmail } from "../../../../lib/escrow/resolve-customer-email"

type EditBody = z.infer<typeof PostEditReviewSchema>
type DeleteBody = z.infer<typeof DeleteReviewSchema>

// Buyer edits inside the window (email = ownership proof; if the caller is an
// authenticated customer, their JWT email is authoritative instead).
export const POST = async (
  req: MedusaRequest<EditBody>,
  res: MedusaResponse
) => {
  const { email, rating, comment } = req.validatedBody
  const ownerEmail = await resolveAuthoritativeEmail(req, email)
  const reviews = req.scope.resolve<ReviewsModuleService>(REVIEWS_MODULE)
  const review = await reviews.editReview(req.params.id, ownerEmail, {
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
  const ownerEmail = await resolveAuthoritativeEmail(req, email)
  const reviews = req.scope.resolve<ReviewsModuleService>(REVIEWS_MODULE)
  await reviews.deleteOwnedReview(req.params.id, ownerEmail)
  res.json({ id: req.params.id, deleted: true })
}

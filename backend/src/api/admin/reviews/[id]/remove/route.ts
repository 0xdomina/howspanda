import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { z } from "@medusajs/framework/zod"
import { REVIEWS_MODULE } from "../../../../../modules/reviews"
import type ReviewsModuleService from "../../../../../modules/reviews/service"
import { PostRemoveReviewSchema } from "../../../../middlewares"

type Body = z.infer<typeof PostRemoveReviewSchema>

export const POST = async (
  req: AuthenticatedMedusaRequest<Body>,
  res: MedusaResponse
) => {
  const reviews = req.scope.resolve<ReviewsModuleService>(REVIEWS_MODULE)
  const review = await reviews.removeReview(
    req.params.id,
    req.validatedBody.reason
  )
  res.json({ review })
}

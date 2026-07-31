import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { REVIEWS_MODULE } from "../../../../../modules/reviews"
import type ReviewsModuleService from "../../../../../modules/reviews/service"

export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
  const reviews = req.scope.resolve<ReviewsModuleService>(REVIEWS_MODULE)
  const aggregate = await reviews.getProductRatingAggregate(req.params.id)
  res.json(aggregate)
}

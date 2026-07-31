import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import {
  ContainerRegistrationKeys,
  MedusaError,
} from "@medusajs/framework/utils"
import { z } from "@medusajs/framework/zod"
import { assertOrderEmail } from "../../../../../lib/escrow/order-access"
import { MARKETPLACE_MODULE } from "../../../../../modules/marketplace"
import type MarketplaceModuleService from "../../../../../modules/marketplace/service"
import { REVIEWS_MODULE } from "../../../../../modules/reviews"
import type ReviewsModuleService from "../../../../../modules/reviews/service"
import { PostCreateReviewSchema } from "../../../../middlewares"

type Body = z.infer<typeof PostCreateReviewSchema>

// One review per delivered order. Ownership = order id + exact email; the
// delivered gate reads the commission line (Phase 6 rails).
export const POST = async (
  req: MedusaRequest<Body>,
  res: MedusaResponse
) => {
  const orderId = req.params.id
  const { email, rating, comment, product_ratings } = req.validatedBody

  await assertOrderEmail(req.scope, orderId, email)

  const marketplace =
    req.scope.resolve<MarketplaceModuleService>(MARKETPLACE_MODULE)
  const lines = await marketplace.resolveLinesForOrder(orderId)
  if (!lines.length || !lines.some((l) => l.delivered_at)) {
    throw new MedusaError(
      MedusaError.Types.NOT_ALLOWED,
      "You can review an order once it has been delivered"
    )
  }

  // product_ratings must belong to this order — resolve its items
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const { data: [order] } = await query.graph({
    entity: "order",
    fields: ["id", "items.product_id"],
    filters: { id: orderId },
  })
  const orderProductIds = (order?.items ?? [])
    .map((i) => i?.product_id)
    .filter(Boolean) as string[]

  const reviews = req.scope.resolve<ReviewsModuleService>(REVIEWS_MODULE)
  const review = await reviews.createReview({
    seller_id: lines[0].seller_id as string,
    order_id: orderId,
    buyer_email: email,
    rating,
    comment,
    product_ratings,
    order_product_ids: orderProductIds,
  })

  res.status(201).json({ review })
}

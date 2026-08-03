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

// One review per delivered seller order. Ownership = order id + exact email;
// the delivered gate reads the commission line (Phase 6 rails). A multi-seller
// parent order resolves to several sellers' lines — that's ambiguous to
// attribute and score, so it must be reviewed per child (seller) order.
export const POST = async (
  req: MedusaRequest<Body>,
  res: MedusaResponse
) => {
  const orderId = req.params.id
  const { email, rating, comment, product_ratings } = req.validatedBody

  const access = await assertOrderEmail(req.scope, orderId, email, req)

  const marketplace =
    req.scope.resolve<MarketplaceModuleService>(MARKETPLACE_MODULE)
  const lines = await marketplace.resolveLinesForOrder(orderId)
  if (!lines.length) {
    throw new MedusaError(
      MedusaError.Types.NOT_ALLOWED,
      "You can review an order once it has been delivered"
    )
  }

  // A parent order spanning multiple sellers can't be attributed to one score
  // or consume a single review slot — send the buyer to the per-seller orders.
  const sellerIds = new Set(lines.map((l) => l.seller_id))
  if (sellerIds.size > 1) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "This order contains items from multiple stores — review each store's order individually"
    )
  }

  if (!lines.some((l) => l.delivered_at)) {
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
    buyer_email: access.email,
    rating,
    comment,
    product_ratings,
    order_product_ids: orderProductIds,
  })

  res.status(201).json({ review })
}

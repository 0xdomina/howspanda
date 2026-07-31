import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import {
  ContainerRegistrationKeys,
  MedusaError,
} from "@medusajs/framework/utils"
import { maskName } from "../../../../../lib/reviews/mask-name"
import { REVIEWS_MODULE } from "../../../../../modules/reviews"
import type ReviewsModuleService from "../../../../../modules/reviews/service"

export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const { data: [seller] } = await query.graph({
    entity: "seller",
    fields: ["id"],
    filters: { handle: req.params.handle },
  })
  if (!seller) {
    throw new MedusaError(MedusaError.Types.NOT_FOUND, "Store not found")
  }

  // Public, unauthenticated route — a bad ?limit=abc / negative / float must
  // not reach the ORM as NaN and 500. Coerce to sane, clamped integers.
  const rawLimit = Number(req.query.limit ?? 20)
  const limit = Number.isFinite(rawLimit)
    ? Math.min(Math.max(Math.trunc(rawLimit), 1), 100)
    : 20
  const rawOffset = Number(req.query.offset ?? 0)
  const offset = Number.isFinite(rawOffset)
    ? Math.max(Math.trunc(rawOffset), 0)
    : 0

  const reviews = req.scope.resolve<ReviewsModuleService>(REVIEWS_MODULE)
  const [items, count] = await reviews.listAndCountReviews(
    { seller_id: seller.id, status: "published" },
    { order: { created_at: "DESC" }, take: limit, skip: offset }
  )

  res.json({
    reviews: items.map((r) => ({
      id: r.id,
      name: maskName(r.buyer_email),
      rating: r.rating,
      comment: r.comment,
      reply_body: r.reply_body,
      replied_at: r.replied_at,
      created_at: r.created_at,
    })),
    count,
    limit,
    offset,
  })
}

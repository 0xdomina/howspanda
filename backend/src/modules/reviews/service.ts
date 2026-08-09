import { MedusaError, MedusaService } from "@medusajs/framework/utils"
import Review from "./models/review"
import ProductRating from "./models/product-rating"

const DAY_MS = 24 * 60 * 60 * 1000

type CreateReviewInput = {
  seller_id: string
  order_id: string
  buyer_email: string
  rating: number
  comment?: string | null
  product_ratings?: { product_id: string; rating: number }[]
  // product ids the reviewed order actually contains (route resolves these)
  order_product_ids: string[]
}

class ReviewsModuleService extends MedusaService({
  Review,
  ProductRating,
}) {
  private editWindowDays(): number {
    // A misconfigured/non-numeric env must not silently disable the window
    // (NaN comparisons are always false) — fall back to the 7-day default.
    const n = Number(process.env.REVIEW_EDIT_WINDOW_DAYS)
    return Number.isFinite(n) && n > 0 ? n : 7
  }

  private assertRating(r: number) {
    if (!Number.isInteger(r) || r < 1 || r > 5) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "Rating must be an integer between 1 and 5"
      )
    }
  }

  private assertComment(comment?: string | null) {
    if (comment && comment.length > 2000) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "Comment must be 2000 characters or fewer"
      )
    }
  }

  // One review per order, forever. Product ratings must belong to the order.
  async createReview(input: CreateReviewInput) {
    this.assertRating(input.rating)
    this.assertComment(input.comment)

    const existing = await this.listReviews({ order_id: input.order_id })
    if (existing.length) {
      throw new MedusaError(
        MedusaError.Types.CONFLICT,
        "This order already has a review"
      )
    }

    const productRatings = input.product_ratings ?? []
    const seen = new Set<string>()
    for (const pr of productRatings) {
      this.assertRating(pr.rating)
      if (!input.order_product_ids.includes(pr.product_id)) {
        throw new MedusaError(
          MedusaError.Types.NOT_ALLOWED,
          `Product ${pr.product_id} is not part of this order`
        )
      }
      if (seen.has(pr.product_id)) {
        throw new MedusaError(
          MedusaError.Types.INVALID_DATA,
          `Duplicate rating for product ${pr.product_id}`
        )
      }
      seen.add(pr.product_id)
    }

    const [review] = await this.createReviews([
      {
        seller_id: input.seller_id,
        order_id: input.order_id,
        buyer_email: input.buyer_email.trim().toLowerCase(),
        rating: input.rating,
        comment: input.comment ?? null,
      },
    ])

    if (productRatings.length) {
      // The review and its ratings can't share one commit here, so compensate:
      // a failed ratings insert must not leave a committed review that the
      // one-per-order guard would then lock the buyer out of forever.
      try {
        await this.createProductRatings(
          productRatings.map((pr) => ({
            review_id: review.id,
            product_id: pr.product_id,
            rating: pr.rating,
          }))
        )
      } catch (e) {
        await this.deleteReviews([review.id]).catch(() => {})
        throw e
      }
    }

    return await this.retrieveReview(review.id, {
      relations: ["product_ratings"],
    })
  }

  // Buyer-owned, published, inside the window — else the right refusal.
  private async getEditable(id: string, email: string) {
    const review = await this.retrieveReview(id).catch(() => null)
    if (
      !review ||
      review.buyer_email.toLowerCase() !== email.trim().toLowerCase()
    ) {
      // hide existence from non-owners — same shape as order-email checks
      throw new MedusaError(MedusaError.Types.NOT_FOUND, "Review not found")
    }
    if (review.status === "removed") {
      throw new MedusaError(
        MedusaError.Types.NOT_ALLOWED,
        "This review was removed and can no longer be changed"
      )
    }
    const age = Date.now() - new Date(review.created_at).getTime()
    if (age > this.editWindowDays() * DAY_MS) {
      throw new MedusaError(
        MedusaError.Types.NOT_ALLOWED,
        `The ${this.editWindowDays()}-day edit window has closed`
      )
    }
    return review
  }

  async editReview(
    id: string,
    email: string,
    changes: { rating?: number; comment?: string | null }
  ) {
    await this.getEditable(id, email)
    if (changes.rating !== undefined) this.assertRating(changes.rating)
    if (changes.comment !== undefined) this.assertComment(changes.comment)

    const patch: Record<string, unknown> = { id }
    if (changes.rating !== undefined) patch.rating = changes.rating
    if (changes.comment !== undefined) patch.comment = changes.comment
    const [updated] = await this.updateReviews([patch])
    return updated
  }

  async deleteOwnedReview(id: string, email: string) {
    await this.getEditable(id, email)
    // product_rating.review_id has no ON DELETE CASCADE and the model declares
    // no delete-cascade, so clear the children first or the hard delete of the
    // parent trips the FK constraint.
    await this.deleteProductRatings({ review_id: id })
    await this.deleteReviews([id])
  }

  // Owning seller, exactly once.
  async replyToReview(id: string, sellerId: string, body: string) {
    const review = await this.retrieveReview(id).catch(() => null)
    if (!review || review.seller_id !== sellerId) {
      throw new MedusaError(MedusaError.Types.NOT_FOUND, "Review not found")
    }
    if (review.status === "removed") {
      throw new MedusaError(
        MedusaError.Types.NOT_ALLOWED,
        "This review was removed"
      )
    }
    if (review.reply_body) {
      throw new MedusaError(
        MedusaError.Types.NOT_ALLOWED,
        "You have already replied to this review"
      )
    }
    const [updated] = await this.updateReviews([
      { id, reply_body: body, replied_at: new Date() },
    ])
    return updated
  }

  // Admin takedown — terminal; leaves public lists and the score instantly.
  async removeReview(id: string, reason: string) {
    const review = await this.retrieveReview(id).catch(() => null)
    if (!review) {
      throw new MedusaError(MedusaError.Types.NOT_FOUND, "Review not found")
    }
    const [updated] = await this.updateReviews([
      { id, status: "removed", removed_reason: reason },
    ])
    return updated
  }

  // Product-page aggregate — only ratings on still-published reviews count.
  async getProductRatingAggregate(productId: string) {
    const ratings = await this.listProductRatings(
      { product_id: productId },
      { relations: ["review"], take: null }
    )
    const live = ratings.filter((r) => r.review?.status === "published")
    const count = live.length
    const average = count
      ? Math.round((live.reduce((a, r) => a + r.rating, 0) / count) * 10) / 10
      : 0
    return {
      average,
      count,
      reviews: live
        .filter((r) => r.review)
        .map((r) => ({
          id: r.review!.id,
          rating: r.rating,
          comment: r.review!.comment,
          reply_body: r.review!.reply_body,
          created_at: r.review!.created_at,
          buyer_email: r.review!.buyer_email,
        })),
    }
  }
}

export default ReviewsModuleService

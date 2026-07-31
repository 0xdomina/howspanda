import { model } from "@medusajs/framework/utils"
import ProductRating from "./product-rating"

// One review per real, delivered order (Phase 8). The store `rating` is the
// trust-score input; `comment` is the human voice. `buyer_email` is the Phase 6
// identity placeholder — masked at read time on public surfaces, swapped for
// Telegram usernames in the frontend phase with zero migration.
const Review = model.define("review", {
  id: model.id().primaryKey(),
  seller_id: model.text(),
  order_id: model.text().unique(),
  buyer_email: model.text(),
  rating: model.number(),
  comment: model.text().nullable(),
  status: model.enum(["published", "removed"]).default("published"),
  removed_reason: model.text().nullable(),
  reply_body: model.text().nullable(),
  replied_at: model.dateTime().nullable(),
  product_ratings: model.hasMany(() => ProductRating, {
    mappedBy: "review",
  }),
})

export default Review

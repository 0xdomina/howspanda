import { model } from "@medusajs/framework/utils"
import Review from "./review"

// Optional per-item rating riding a store review. Surfaced through one
// aggregate endpoint now; rich product-page reviews are frontend-phase work.
const ProductRating = model.define("product_rating", {
  id: model.id().primaryKey(),
  product_id: model.text(),
  rating: model.number(),
  review: model.belongsTo(() => Review, {
    mappedBy: "product_ratings",
  }),
})

export default ProductRating

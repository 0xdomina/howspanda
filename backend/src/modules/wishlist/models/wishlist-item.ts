import { model } from "@medusajs/framework/utils"

// Buyer-owned saved products. The display fields are a snapshot so a saved
// item remains readable even when a product is later unpublished.
const WishlistItem = model.define("wishlist_item", {
  id: model.id().primaryKey(),
  customer_id: model.text().searchable(),
  item_id: model.text().searchable(),
  handle: model.text().nullable(),
  title: model.text(),
  thumbnail: model.text().nullable(),
  price: model.text().nullable(),
})

export default WishlistItem

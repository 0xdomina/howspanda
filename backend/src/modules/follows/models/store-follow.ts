import { model } from "@medusajs/framework/utils"

// A buyer following a store. Identity is COUNT-ONLY — the seller never learns
// who their followers are, only how many (and the platform is the only channel
// between them). unique(seller_id, customer_id).
const StoreFollow = model.define("store_follow", {
  id: model.id().primaryKey(),
  seller_id: model.text().searchable(),
  customer_id: model.text().searchable(),
})

export default StoreFollow

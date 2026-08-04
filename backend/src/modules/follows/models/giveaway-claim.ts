import { model } from "@medusajs/framework/utils"

// A follower claiming a giveaway broadcast. unique(broadcast_id, customer_id) —
// one claim per follower per giveaway.
const GiveawayClaim = model.define("giveaway_claim", {
  id: model.id().primaryKey(),
  broadcast_id: model.text().searchable(),
  customer_id: model.text().searchable(),
})

export default GiveawayClaim
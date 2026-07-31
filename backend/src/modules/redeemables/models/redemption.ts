import { model } from "@medusajs/framework/utils"
import Redeemable from "./redeemable"

// Audit row per use — the seller's receipt and the buyer's proof.
const Redemption = model.define("redemption", {
  id: model.id().primaryKey(),
  amount_applied: model.bigNumber(),
  order_id: model.text().nullable(),
  channel: model.enum(["checkout", "in_store"]),
  redeemable: model.belongsTo(() => Redeemable, {
    mappedBy: "redemptions",
  }),
})

export default Redemption

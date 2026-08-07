import { model } from "@medusajs/framework/utils"
import Mall from "./mall"

// A recorded purchase attributed to a mall buyer — one lottery entry. The
// (mall_id, order_id) pair is UNIQUE, so replaying the same order for a mall
// is a no-op instead of another lottery roll (a buyer must make a real new
// purchase to earn another ticket).
//
// NOTE: `mkt_mall_purchase` avoids name collisions.
const MallPurchase = model.define("mkt_mall_purchase", {
  id: model.id().primaryKey(),
  mall: model.belongsTo(() => Mall, {
    mappedBy: "purchases",
  }),
  order_id: model.text(),
  buyer_email: model.text(),
})

export default MallPurchase

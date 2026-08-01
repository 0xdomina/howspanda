import { model } from "@medusajs/framework/utils"
import Mall from "./mall"

// A buyer's participation in a mall: they've joined (expressed interest) and
// tracks their purchase activity + win status.
//
// NOTE: `mkt_mall_buyer` avoids name collisions.
const MallBuyer = model.define("mkt_mall_buyer", {
  id: model.id().primaryKey(),
  mall: model.belongsTo(() => Mall, {
    mappedBy: "buyers",
  }),
  buyer_email: model.text(),
  joined_at: model.dateTime(),
  purchase_count: model.number().default(0),
  has_won: model.boolean().default(false),
  won_prize_ngn: model.bigNumber().nullable(),
  won_at: model.dateTime().nullable(),
})

export default MallBuyer

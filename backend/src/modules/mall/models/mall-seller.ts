import { model } from "@medusajs/framework/utils"
import Mall from "./mall"

// A seller's participation in a mall: their cash contribution to the prize pool
// and an optional redeemable gift (gift card, voucher, ticket) they're offering
// as an extra prize for buyers.
//
// NOTE: `mkt_mall_seller` avoids name collisions.
const MallSeller = model.define("mkt_mall_seller", {
  id: model.id().primaryKey(),
  mall: model.belongsTo(() => Mall, {
    mappedBy: "sellers",
  }),
  seller_id: model.text(),
  contribution_ngn: model.bigNumber(),
  // Selected published products. NULL keeps legacy malls compatible by
  // including every published product from the participating seller.
  product_ids: model.json().nullable(),
  contribution_ledger_id: model.text().nullable(),
  // Optional redeemable gift attached by this seller (gift card, voucher, ticket)
  redeemable_id: model.text().nullable(),
  joined_at: model.dateTime(),
})

export default MallSeller

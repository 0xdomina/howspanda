import { model } from "@medusajs/framework/utils"
import Mall from "./mall"

// A prize awarded to a buyer in a mall. Tracks the amount, whether it was a
// random draw, any attached redeemable gift, and the wallet ledger line for
// the credit.
//
// NOTE: `mkt_mall_prize` avoids name collisions.
const MallPrize = model.define("mkt_mall_prize", {
  id: model.id().primaryKey(),
  mall: model.belongsTo(() => Mall, {
    mappedBy: "prizes",
  }),
  winner_buyer_email: model.text(),
  // Stable winner slot prevents concurrent purchases from allocating more
  // winners than the mall configured.
  winner_slot: model.number().nullable(),
  amount_ngn: model.bigNumber(),
  is_random: model.boolean().default(true),
  // Optional redeemable gift awarded alongside cash (from a seller's contribution)
  redeemable_id: model.text().nullable(),
  // For auditability — logs the random seed used in the draw
  random_seed: model.text().nullable(),
  // The buyer-wallet ledger line that carried the credit (set on award)
  wallet_ledger_id: model.text().nullable(),
  claimed: model.boolean().default(false),
  claimed_at: model.dateTime().nullable(),
})

export default MallPrize

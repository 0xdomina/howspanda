import { model } from "@medusajs/framework/utils"
import MallSeller from "./mall-seller"
import MallBuyer from "./mall-buyer"
import MallPrize from "./mall-prize"
import MallPurchase from "./mall-purchase"

// A digital mall — a gamified, time-boxed marketplace event.
//
// Lifecycle:
//   pending   — created, gathering sellers (needs 5+) and buyers (needs 10+) to go live
//   active    — thresholds met, buyers can purchase and win prizes
//   settling  — all prizes drawn, finalizing
//   expired   — time ran out, pending refunds
//   cancelled — never launched, refunds issued
//   closed    — terminal state
//
// The bonding-curve mechanic: more sellers → bigger prize pool → more buyer interest.
// Prize draws are luck-based (random), not deterministic.
//
// NOTE: `mkt_mall` avoids the built-in promotion `campaign` alias.
const Mall = model.define("mkt_mall", {
  id: model.id().primaryKey(),
  name: model.text(),
  description: model.text().nullable(),
  created_by_seller_id: model.text(),
  status: model
    .enum(["pending", "active", "settling", "expired", "cancelled", "closed"])
    .default("pending"),
  // Bonding-curve thresholds
  target_sellers: model.number().default(5),
  target_buyers: model.number().default(10),
  // Prize configuration
  prize_winner_count: model.number().default(3),
  prize_distribution: model
    .enum(["equal", "random"])
    .default("equal"),
  // Prize pool (in kobo/cents — bigNumber for precision)
  prize_pool_ngn: model.bigNumber().default(0),
  contributed_ngn: model.bigNumber().default(0),
  remaining_ngn: model.bigNumber().default(0),
  // Time bounds
  starts_at: model.dateTime().nullable(),
  ends_at: model.dateTime().nullable(),
  expires_at: model.dateTime(),
  // Relations
  sellers: model.hasMany(() => MallSeller, {
    mappedBy: "mall",
  }),
  buyers: model.hasMany(() => MallBuyer, {
    mappedBy: "mall",
  }),
  prizes: model.hasMany(() => MallPrize, {
    mappedBy: "mall",
  }),
  purchases: model.hasMany(() => MallPurchase, {
    mappedBy: "mall",
  }),
})

export default Mall

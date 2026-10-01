import { model } from "@medusajs/framework/utils"
import CampaignParticipant from "./campaign-participant"
import CampaignReward from "./campaign-reward"

// A plug-and-play marketing campaign — the platform's generic reward engine.
//
// Lifecycle:
//   draft  — created, not yet visible on the storefront
//   live   — visible and scoring (bounded by starts_at/ends_at)
//   paused — hidden kill switch; scoring halts, earned rewards stay claimable
//   ended  — terminal; rewards remain claimable until claim_until
//
// `event` selects what scores a point (visit, first_transaction,
// any_transaction, store_creation, referral_qualified). `rules` carries the
// per-event thresholds (e.g. minimum spend). `reward_template` carries
// { kind, amount_ngn } used when issuing rewards.
//
// Money guards: pool_ngn is the funding pool (issued rewards never exceed
// it), per_user_cap_ngn bounds one participant, global_cap_ngn bounds the
// whole campaign. giftcard_fixed / voucher_fixed rewards mint a fixed-value
// redeemable at CLAIM time only — the amount is fixed forever, never adjusted.
//
// NOTE: `mkt_campaign` follows the `mkt_mall` precedent — a custom prefix
// avoids Medusa's built-in promotion `campaign` alias.
const Campaign = model.define("mkt_campaign", {
  id: model.id().primaryKey(),
  name: model.text(),
  slug: model.text().unique(),
  sponsor: model.text().nullable(),
  status: model.enum(["draft", "live", "paused", "ended"]).default("draft"),
  // Time bounds; admin expiry = flipping to `ended`/`paused` or backdating ends_at.
  starts_at: model.dateTime().nullable(),
  ends_at: model.dateTime().nullable(),
  // Rewards stay claimable until this date (null = no claim deadline).
  claim_until: model.dateTime().nullable(),
  audience: model.enum(["sellers", "buyers", "all"]).default("all"),
  // Scoped store ids as { ids: [...] }; null = platform-wide.
  store_ids: model.json().nullable(),
  event: model.enum([
    "visit",
    "first_transaction",
    "any_transaction",
    "store_creation",
    "referral_qualified",
  ]),
  // Per-event thresholds, e.g. { min_spend_ngn: 1000 }.
  rules: model.json().nullable(),
  // Reward shape, e.g. { kind: "wallet_credit", amount_ngn: 500 }.
  reward_template: model.json().nullable(),
  pool_ngn: model.bigNumber().default(0),
  per_user_cap_ngn: model.bigNumber().nullable(),
  global_cap_ngn: model.bigNumber().nullable(),
  participants: model.hasMany(() => CampaignParticipant, {
    mappedBy: "campaign",
  }),
  rewards: model.hasMany(() => CampaignReward, {
    mappedBy: "campaign",
  }),
})

export default Campaign

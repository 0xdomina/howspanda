import { model } from "@medusajs/framework/utils"
import Campaign from "./campaign"
import CampaignReward from "./campaign-reward"

// A participant's standing in a campaign. One row per (campaign, actor):
// sellers keyed by seller_id, buyers by buyer_email. `score` is the
// leaderboard value (points accrued from scored events).
//
// `events` is the anti-double-count ledger: { [eventKey]: true } where the
// eventKey embeds the source id (e.g. an order id or referral id), so every
// scoring event is idempotent.
//
// Uniqueness per (campaign, actor) is enforced in the service (get-or-create),
// matching the growth referral pattern.
const CampaignParticipant = model.define("mkt_campaign_participant", {
  id: model.id().primaryKey(),
  campaign: model.belongsTo(() => Campaign, {
    mappedBy: "participants",
  }),
  actor_type: model.enum(["seller", "buyer"]),
  seller_id: model.text().nullable(),
  buyer_email: model.text().nullable(),
  score: model.bigNumber().default(0),
  events: model.json().nullable(),
  rewards: model.hasMany(() => CampaignReward, {
    mappedBy: "participant",
  }),
})

export default CampaignParticipant

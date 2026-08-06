import { model } from "@medusajs/framework/utils"
import Challenge from "./challenge"
import ChallengeReward from "./challenge-reward"

// A participant's standing in a challenge. One row per (challenge, actor):
// sellers keyed by seller_id, buyers by buyer_email. `score` is the leaderboard
// value (qualified invites for `invite`, cumulative spend for `arc_pool`).
//
// `meta` carries engine bookkeeping so every scoring event is idempotent:
//   events       { [eventKey]: true }   anti-double-count ledger (eventKey
//                                       embeds the source id, e.g. a referral id
//                                       or order id)
//   spend_ngn    cumulative qualifying spend (arc_pool)
//   tickets      raffle tickets accrued (arc_pool)
//
// Uniqueness per (challenge, actor) is enforced in the service (get-or-create),
// matching the referral pattern.
const ChallengeParticipant = model.define("mkt_challenge_participant", {
  id: model.id().primaryKey(),
  challenge: model.belongsTo(() => Challenge, {
    mappedBy: "participants",
  }),
  actor_type: model.enum(["seller", "buyer"]),
  seller_id: model.text().nullable(),
  buyer_email: model.text().nullable(),
  score: model.bigNumber().default(0),
  meta: model.json().nullable(),
  claimed: model.boolean().default(false),
  claimed_at: model.dateTime().nullable(),
  rewards: model.hasMany(() => ChallengeReward, {
    mappedBy: "participant",
  }),
})

export default ChallengeParticipant

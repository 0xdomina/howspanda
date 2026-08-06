import { model } from "@medusajs/framework/utils"
import ChallengeParticipant from "./challenge-participant"
import ChallengeReward from "./challenge-reward"

// A challenge campaign — the platform's gamified growth engine (Phases 17-18).
//
// Lifecycle:
//   draft — created, not yet visible on the storefront
//   live  — visible and accepting participation (bounded by starts_at/ends_at)
//   ended — terminal; earned rewards remain claimable
//
// `type` selects the scoring engine:
//   invite   — sellers earn a score per qualified referral (double-sided: the
//              invitee buyer also earns a credit). Milestones pay seller credits.
//   arc_pool — buyers earn spend-based revenue-share + raffle tickets; the pool
//              is settled at campaign end through the buyer wallet
//              (ledger source "campaign").
//
// NOTE: `mkt_challenge` follows the `mkt_mall` precedent — a custom prefix avoids
// Medusa's built-in promotion `campaign` alias.
const Challenge = model.define("mkt_challenge", {
  id: model.id().primaryKey(),
  name: model.text(),
  slug: model.text().unique(),
  description: model.text().nullable(),
  type: model.enum(["invite", "arc_pool"]),
  audience: model.enum(["sellers", "buyers", "all"]).default("all"),
  status: model.enum(["draft", "live", "ended"]).default("draft"),
  // Time bounds; admin expiry = flipping to `ended` or backdating ends_at.
  starts_at: model.dateTime().nullable(),
  ends_at: model.dateTime().nullable(),
  // Reward rules: { milestones, buyer_reward_ngn, cap_ngn } for invite,
  // { ticket_spend_ngn, prize_winner_count } for arc_pool.
  config: model.json().nullable(),
  participants: model.hasMany(() => ChallengeParticipant, {
    mappedBy: "challenge",
  }),
  rewards: model.hasMany(() => ChallengeReward, {
    mappedBy: "challenge",
  }),
})

export default Challenge

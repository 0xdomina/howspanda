import { model } from "@medusajs/framework/utils"
import Challenge from "./challenge"
import ChallengeParticipant from "./challenge-participant"

// A reward earned inside a challenge.
//   buyer_credit  — paid into the buyer wallet on claim (ledger source
//                   "campaign"); `reference` = the wallet ledger id.
//   seller_credit — paid as a marketplace commission line on claim (Phase 9
//                   pattern); `reference` = the commission line id.
//
// Lifecycle: issued → claimed (claimed_at + reference set) | voided. Money
// moves ONLY at claim, so an unclaimed reward is never "in" a wallet.
const ChallengeReward = model.define("mkt_challenge_reward", {
  id: model.id().primaryKey(),
  challenge: model.belongsTo(() => Challenge, {
    mappedBy: "rewards",
  }),
  participant: model.belongsTo(() => ChallengeParticipant, {
    mappedBy: "rewards",
  }),
  kind: model.enum(["buyer_credit", "seller_credit"]),
  amount: model.bigNumber(),
  currency_code: model.text().default("ngn"),
  status: model.enum(["issued", "claimed", "voided"]).default("issued"),
  reference: model.text().nullable(),
  issued_at: model.dateTime(),
  claimed_at: model.dateTime().nullable(),
})

export default ChallengeReward

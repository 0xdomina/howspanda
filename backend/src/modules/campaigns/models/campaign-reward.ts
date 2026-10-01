import { model } from "@medusajs/framework/utils"
import Campaign from "./campaign"
import CampaignParticipant from "./campaign-participant"

// A reward earned inside a campaign.
//   wallet_credit  — paid into the buyer wallet on claim; `reference` = the
//                    wallet ledger id.
//   seller_credit  — paid as a marketplace commission line on claim;
//                    `reference` = the commission line id.
//   giftcard_fixed — a fixed-value gift card minted through redeemables at
//                    CLAIM time; `reference` = the redeemable code. The amount
//                    is fixed forever, never adjusted.
//   voucher_fixed  — a fixed-value voucher minted the same way.
//
// Lifecycle: issued → claimed (claimed_at + reference set) | expired | voided.
// Money moves ONLY at claim, so an unclaimed reward holds no value anywhere.
const CampaignReward = model.define("mkt_campaign_reward", {
  id: model.id().primaryKey(),
  campaign: model.belongsTo(() => Campaign, {
    mappedBy: "rewards",
  }),
  participant: model.belongsTo(() => CampaignParticipant, {
    mappedBy: "rewards",
  }),
  kind: model.enum([
    "wallet_credit",
    "seller_credit",
    "giftcard_fixed",
    "voucher_fixed",
  ]),
  amount: model.bigNumber(),
  currency_code: model.text().default("ngn"),
  status: model.enum(["issued", "claimed", "expired", "voided"]).default("issued"),
  reference: model.text().nullable(),
  issued_at: model.dateTime(),
  claimed_at: model.dateTime().nullable(),
})

export default CampaignReward

import { model } from "@medusajs/framework/utils"

// A referral: a seller invites a buyer; the buyer's FIRST completed (escrow-
// released) transaction qualifies the referral and pays the referrer a 0%
// commission reward through the existing settlement + payout rails (Phase 9).
// Qualification is evaluated on read (trust-score pattern) and is idempotent.
const Referral = model.define("referral", {
  id: model.id().primaryKey(),
  // unguessable share code
  code: model.text().unique(),
  referrer_role: model.enum(["seller"]).default("seller"),
  referrer_seller_id: model.text(),
  // bound when the referee claims the code with their email
  referee_email: model.text().nullable(),
  status: model.enum(["pending", "qualified"]).default("pending"),
  reward_amount: model.bigNumber().nullable(),
  currency_code: model.text().default("ngn"),
  capped_reason: model.text().nullable(),
  qualified_at: model.dateTime().nullable(),
  // the marketplace CommissionLine that carries the paid reward
  paid_commission_line_id: model.text().nullable(),
})

export default Referral

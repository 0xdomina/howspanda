import { model } from "@medusajs/framework/utils"
import Seller from "./seller"

// One money-out attempt per row. Lifecycle:
//   requested  — row created, nothing sent yet
//   processing — provider accepted the transfer (provider_reference stored)
//   paid       — provider confirmed (webhook or reconcile)
//   failed     — provider rejected; swept lines are released
//   reversed   — money bounced back after paid; lines return to available
// The provider-side transfer reference is ALWAYS this row's id, and
// idempotency_key is unique, so a replayed request can never double-pay.
const Payout = model.define("payout", {
  id: model.id().primaryKey(),
  currency_code: model.text(),
  amount: model.bigNumber(),
  rail: model.enum(["paystack", "crypto-usdc"]),
  status: model
    .enum(["requested", "processing", "paid", "failed", "reversed"])
    .default("requested"),
  idempotency_key: model.text().unique(),
  provider_reference: model.text().nullable(),
  // snapshot of the payout account used, so history survives account edits
  destination: model.json(),
  failure_reason: model.text().nullable(),
  attempts: model.number().default(0),
  requested_by: model.enum(["seller", "admin", "schedule"]).default("seller"),
  paid_at: model.dateTime().nullable(),
  seller: model.belongsTo(() => Seller, {
    mappedBy: "payouts",
  }),
})

export default Payout

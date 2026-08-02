import { model } from "@medusajs/framework/utils"
import Wallet from "./wallet"

// One buyer wallet money-out attempt per row — the buyer-side mirror of the
// seller `payout` record. Lifecycle is identical:
//   requested  — row created, wallet already debited, nothing sent yet
//   processing — provider accepted the transfer (provider_reference stored)
//   paid       — provider confirmed (webhook or reconcile)
//   failed     — provider rejected; wallet balance is credited back
//   reversed   — money bounced back after paid; balance is credited back
// The provider-side transfer reference is ALWAYS this row's id, and
// idempotency_key is unique, so a replayed request can never double-pay.
const BuyerWithdrawal = model.define("buyer_withdrawal", {
  id: model.id().primaryKey(),
  wallet: model.belongsTo(() => Wallet, {
    mappedBy: "withdrawals",
  }),
  currency_code: model.text(),
  amount: model.bigNumber(),
  rail: model.enum(["paystack", "crypto-usdc"]),
  status: model
    .enum(["requested", "processing", "paid", "failed", "reversed"])
    .default("requested"),
  idempotency_key: model.text().unique(),
  provider_reference: model.text().nullable(),
  // snapshot of the withdrawal account used, so history survives account edits
  destination: model.json(),
  failure_reason: model.text().nullable(),
  attempts: model.number().default(0),
  paid_at: model.dateTime().nullable(),
})

export default BuyerWithdrawal

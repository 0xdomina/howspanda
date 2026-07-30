import { model } from "@medusajs/framework/utils"
import Seller from "./seller"

// Where a seller receives payouts. Bank accounts are verified via Paystack
// name-resolve + transferrecipient creation; crypto addresses get shape
// validation only (the transfer itself is the on-chain verification).
const PayoutAccount = model.define("payout_account", {
  id: model.id().primaryKey(),
  type: model.enum(["bank_account", "crypto_address"]),
  currency_code: model.text().default("ngn"),
  // bank_account fields
  bank_code: model.text().nullable(),
  account_number: model.text().nullable(),
  account_name: model.text().nullable(), // set by Paystack name-resolve
  recipient_code: model.text().nullable(), // Paystack transferrecipient
  // crypto_address fields
  network: model.text().nullable(), // base | solana
  address: model.text().nullable(),
  is_default: model.boolean().default(false),
  status: model
    .enum(["unverified", "verified", "failed"])
    .default("unverified"),
  seller: model.belongsTo(() => Seller, {
    mappedBy: "payout_accounts",
  }),
})

export default PayoutAccount

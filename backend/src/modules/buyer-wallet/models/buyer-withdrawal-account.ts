import { model } from "@medusajs/framework/utils"

// Where a buyer receives a wallet withdrawal. Bank accounts are verified via
// Paystack name-resolve + transferrecipient creation; crypto addresses get
// shape validation only (the transfer itself is the on-chain verification).
// Keyed by the guest-checkout email — the same identity the wallet uses.
const BuyerWithdrawalAccount = model.define("buyer_withdrawal_account", {
  id: model.id().primaryKey(),
  buyer_email: model.text(),
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
})

export default BuyerWithdrawalAccount

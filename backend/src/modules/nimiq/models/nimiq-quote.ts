import { model } from "@medusajs/framework/utils"

// Nimiq Pay payment quote. The wallet pays direct-to-merchant on chain;
// the backend verifies on chain and only then marks paid. Client-reported
// success is never payment proof.
//
// Status flow:
//   quoted  — awaiting wallet payment, expires fast
//   paid    — chain-verified (tx recorded, order may proceed)
//   expired — quote lapsed before verification
//   failed  — verification rejected (wrong network/token/amount/destination)
const NimiqQuote = model.define("nimiq_quote", {
  id: model.id().primaryKey(),
  // Nullable: wallet-native buyers may skip email; receipt needs it.
  buyer_email: model.text().nullable(),
  // Wallet address bound at verify time: payer identity + refund destination.
  payer_address: model.text().nullable(),
  token: model.enum(["USDT", "NIM"]),
  network: model.text(),
  // Token base units (USDT 6dp, NIM Luna). bigNumber: chain magnitudes.
  amount_token_base: model.bigNumber(),
  // Display/accounting total in NGN minor units at quote time.
  amount_ngn_minor: model.number(),
  merchant_address: model.text(),
  reference: model.text().unique(),
  status: model
    .enum(["quoted", "paid", "expired", "failed"])
    .default("quoted"),
  items: model.json().nullable(),
  expires_at: model.dateTime(),
  // Uniqueness enforced by partial unique index in the migration (nullable
  // columns can't chain .unique() in this DSL version).
  tx_hash: model.text().nullable(),
  verified_at: model.dateTime().nullable(),
  order_id: model.text().nullable(),
  cart_id: model.text().nullable(),
})

export default NimiqQuote

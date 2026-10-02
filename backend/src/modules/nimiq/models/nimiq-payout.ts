import { model } from "@medusajs/framework/utils"

// Outbound crypto refund: platform hot wallet → verified buyer.
// Created when a seller confirms a return on a Nimiq-paid order.
// Destination is allowlisted to the quote's bound payer address only —
// arbitrary destinations are never payable, whatever the caller asks.
//
// Status flow:
//   requested — recorded, not yet sent
//   sent      — broadcast, awaiting confirmations
//   confirmed — receipt success at depth
//   failed    — send or confirmation failed (retry creates a new row)
const NimiqPayout = model.define("nimiq_payout", {
  id: model.id().primaryKey(),
  order_id: model.text(),
  quote_id: model.text(),
  token: model.enum(["USDT", "NIM"]),
  network: model.text(),
  destination: model.text(),
  amount_token_base: model.bigNumber(),
  status: model
    .enum(["requested", "sent", "confirmed", "failed"])
    .default("requested"),
  tx_hash: model.text().nullable(),
  attempts: model.number().default(0),
  last_error: model.text().nullable(),
  confirmed_at: model.dateTime().nullable(),
})

export default NimiqPayout

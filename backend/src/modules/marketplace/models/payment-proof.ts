import { model } from "@medusajs/framework/utils"

// Proof of a direct-to-seller bank transfer. The buyer pays the seller's
// verified bank account directly (no platform custody), so this row is the
// only record of payment: what the buyer claims to have sent, the uploaded
// evidence, and the seller's verdict (confirm, or reject with a note).
//
// Status flow:
//   awaiting_proof — order placed, bank details + reference shown, no proof yet
//   submitted      — buyer uploaded proof, awaiting the seller's verdict
//   confirmed      — seller verified the transfer; order proceeds to fulfillment
//   rejected       — seller couldn't find the payment; recheck_until guards a
//                    window where the transfer may still land (seller can flip
//                    to confirmed, buyer can re-upload)
//   expired        — the recheck window lapsed unresolved; order auto-cancelled
const PaymentProof = model.define("payment_proof", {
  id: model.id().primaryKey(),
  order_id: model.text(),
  seller_id: model.text(),
  buyer_email: model.text(),
  reference: model.text(),
  status: model
    .enum(["awaiting_proof", "submitted", "confirmed", "rejected", "expired"])
    .default("awaiting_proof"),
  currency_code: model.text().default("ngn"),
  // claimed amount in minor units (kobo) — the seller compares against their
  // bank statement and the order total when deciding
  amount: model.bigNumber().nullable(),
  // snapshot of the seller account the buyer was told to pay into
  bank: model.json().nullable(),
  proof_url: model.text().nullable(),
  buyer_note: model.text().nullable(),
  rejection_note: model.text().nullable(),
  recheck_until: model.dateTime().nullable(),
  submitted_at: model.dateTime().nullable(),
  confirmed_at: model.dateTime().nullable(),
  rejected_at: model.dateTime().nullable(),
  expired_at: model.dateTime().nullable(),
})

export default PaymentProof

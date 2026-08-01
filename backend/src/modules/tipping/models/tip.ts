import { model } from "@medusajs/framework/utils"

// A cash or extra-product gratuity between a buyer and a seller (Phase 8).
// `tipping` records the social fact; settlement is delegated to `marketplace`
// commission lines (0% commission) so tips flow through the existing balance,
// payout and reversal rails unchanged.
//
//   to_seller          — buyer → seller cash appreciation
//   to_buyer (cash)    — seller → buyer cash thank-you (a gift FROM the seller
//                        ledger; buyer side issued as a recorded credit note,
//                        redemption deferred to a buyer-wallet phase)
//   to_buyer (product) — seller gifting an item from their catalog; no money moves
const Tip = model.define("tip", {
  id: model.id().primaryKey(),
  direction: model.enum(["to_seller", "to_buyer"]),
  // the source (buyer→seller) or gift (seller→buyer) order, when there is one
  order_id: model.text().nullable(),
  buyer_email: model.text(),
  seller_id: model.text(),
  currency_code: model.text().default("ngn"),
  // cash value; null for extra-product tips
  amount: model.bigNumber().nullable(),
  // extra-product tips (seller → buyer) record the gifted item
  product_id: model.text().nullable(),
  product_title: model.text().nullable(),
  note: model.text().nullable(),
  status: model.enum(["available", "reversed"]).default("available"),
  // the marketplace CommissionLine that carries the cash settlement
  commission_line_id: model.text().nullable(),
  // seller → buyer cash tips issue a buyer-side credit note (redemption deferred)
  buyer_credit_status: model
    .enum(["issued", "redeemed", "voided"])
    .nullable(),
  buyer_credit_code: model.text().nullable(),
})

export default Tip

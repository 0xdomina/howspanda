import { model } from "@medusajs/framework/utils"
import Seller from "./seller"

// One ledger line per seller order: what the platform keeps and owes.
// Settlement state machine (Phase 5):
//   pending   — in escrow (Phase 6): undelivered, inside the return window,
//               or held by an open return/complaint — not yet payable
//   available — released from escrow, counts toward the payable balance
//   reserved  — swept into an in-flight payout (payout_id set)
//   paid      — paid out to the seller
//   reversed  — refund/chargeback before payout; excluded from balances.
//               Clawbacks on already-paid lines are negated offset lines
//               (order_id "<id>:reversal") born `available`.
const CommissionLine = model.define("commission_line", {
  id: model.id().primaryKey(),
  order_id: model.text().unique(),
  currency_code: model.text(),
  order_total: model.bigNumber(),
  rate: model.float(),
  commission_amount: model.bigNumber(),
  net_amount: model.bigNumber(),
  status: model
    .enum(["pending", "available", "reserved", "paid", "reversed"])
    .default("pending"),
  available_at: model.dateTime().nullable(),
  payout_id: model.text().nullable(),
  reversal_reason: model.text().nullable(),
  // Escrow (Phase 6): release is driven by delivery + return window, not time
  parent_order_id: model.text().nullable(),
  delivered_at: model.dateTime().nullable(),
  confirmed_at: model.dateTime().nullable(),
  release_due_at: model.dateTime().nullable(),
  held_at: model.dateTime().nullable(),
  hold_reason: model.text().nullable(),
  seller: model.belongsTo(() => Seller, {
    mappedBy: "commission_lines",
  }),
})

export default CommissionLine

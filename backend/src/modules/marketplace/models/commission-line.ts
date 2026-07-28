import { model } from "@medusajs/framework/utils"
import Seller from "./seller"

// One ledger line per seller order: what the platform keeps and owes.
const CommissionLine = model.define("commission_line", {
  id: model.id().primaryKey(),
  order_id: model.text().unique(),
  currency_code: model.text(),
  order_total: model.bigNumber(),
  rate: model.float(),
  commission_amount: model.bigNumber(),
  net_amount: model.bigNumber(),
  status: model.enum(["pending", "paid"]).default("pending"),
  seller: model.belongsTo(() => Seller, {
    mappedBy: "commission_lines",
  }),
})

export default CommissionLine

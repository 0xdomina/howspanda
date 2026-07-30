import { model } from "@medusajs/framework/utils"
import SellerAdmin from "./seller-admin"
import CommissionLine from "./commission-line"
import Payout from "./payout"
import PayoutAccount from "./payout-account"

const Seller = model.define("seller", {
  id: model.id().primaryKey(),
  handle: model.text().unique(),
  name: model.text(),
  logo: model.text().nullable(),
  description: model.text().nullable(),
  verification_status: model
    .enum(["unverified", "pending", "verified"])
    .default("unverified"),
  // platform commission as a fraction (0.1 = 10%), configurable per seller
  commission_rate: model.float().default(0.1),
  admins: model.hasMany(() => SellerAdmin, {
    mappedBy: "seller",
  }),
  commission_lines: model.hasMany(() => CommissionLine, {
    mappedBy: "seller",
  }),
  payouts: model.hasMany(() => Payout, {
    mappedBy: "seller",
  }),
  payout_accounts: model.hasMany(() => PayoutAccount, {
    mappedBy: "seller",
  }),
})

export default Seller

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
  cover_image: model.text().nullable(),
  description: model.text().nullable(),
  accent_color: model.text().default("#ef4444"),
  theme: model.text().default("sunset"),
  verification_status: model
    .enum(["unverified", "pending", "verified"])
    .default("unverified"),
  // optional per-seller commission override as a fraction; NULL = use the
  // platform tiered schedule (3–5%, tapering down on larger orders — see
  // src/lib/marketplace/commission.ts)
  commission_rate: model.float().nullable(),
  // per-seller crypto payment switch: when OFF the crypto-usdc rail is closed
  // for this seller (no crypto session can be created against their products)
  crypto_payments_enabled: model.boolean().default(true),
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

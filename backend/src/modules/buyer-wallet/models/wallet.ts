import { model } from "@medusajs/framework/utils"
import WalletLedger from "./wallet-ledger"
import BuyerWithdrawal from "./buyer-withdrawal"

// A genuine per-buyer (email) balance — the withdrawal surface that unifies the
// buyer-side rewards across the platform: campaign rewards (Phase 10), buyer
// credit notes (Phase 8 seller→buyer cash tips), and buyer-referrer rewards
// (deferred Phase 9). v1 credits balances honestly; withdrawal to a real
// fiat/crypto rail is a documented stub for a later phase.
const Wallet = model.define("buyer_wallet", {
  id: model.id().primaryKey(),
  // guest-checkout identity today (order-email match); buyer accounts later
  buyer_email: model.text().unique(),
  currency_code: model.text().default("ngn"),
  balance: model.bigNumber().default(0),
  ledger: model.hasMany(() => WalletLedger, {
    mappedBy: "wallet",
  }),
  withdrawals: model.hasMany(() => BuyerWithdrawal, {
    mappedBy: "wallet",
  }),
})

export default Wallet

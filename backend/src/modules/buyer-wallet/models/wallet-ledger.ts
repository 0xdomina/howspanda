import { model } from "@medusajs/framework/utils"
import Wallet from "./wallet"

// Append-only credit/debit lines against a buyer wallet. Signed amount: positive
// = credit in, negative = debit out. `source` tags the originating feature so a
// buyer can see where each unit came from.
const WalletLedger = model.define("buyer_wallet_ledger", {
  id: model.id().primaryKey(),
  wallet: model.belongsTo(() => Wallet, {
    mappedBy: "ledger",
  }),
  amount: model.bigNumber(),
  source: model.enum([
    "campaign",
    "tip_credit",
    "referral",
    "withdrawal",
    "adjustment",
    "mall_prize",
  ]),
  reference: model.text().nullable(),
})

export default WalletLedger

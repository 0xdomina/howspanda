import { model } from "@medusajs/framework/utils"
import UserWallet from "./user-wallet"

// Every wallet spend is a recorded, idempotent intent BEFORE any key signs:
// the amount is locked at creation, the destination is fixed at creation (a
// server-derived session deposit address for payments, or a password-confirmed
// external address for withdrawals), and a replayed idempotency_key returns
// the same intent instead of double-spending. The private key never enters the
// DB — only the resulting transaction hash does.
const WalletSpend = model.define("wallet_spend", {
  id: model.id().primaryKey(),
  // Replay guard: one spend per idempotency key per wallet.
  idempotency_key: model.text(),
  // Destination wallet address the funds moved to (decided at intent creation).
  to_address: model.text(),
  // USDC amount in 6-decimal string form.
  usdc_amount: model.text(),
  // Reference to the platform object this spend funded (payment session id,
  // order id, tip id, ...).
  reference: model.text(),
  // "pending" | "signed" | "confirmed" | "failed"
  status: model.text().default("pending"),
  tx_hash: model.text().nullable(),
  wallet: model.belongsTo(() => UserWallet, {
    mappedBy: "spends",
  }),
})

export default WalletSpend

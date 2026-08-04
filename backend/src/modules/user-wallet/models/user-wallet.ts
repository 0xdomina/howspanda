import { model } from "@medusajs/framework/utils"
import WalletSpend from "./wallet-spend"

// A platform-managed per-user USDC wallet: the platform derives the address
// from its master key (managed-wallet UX — users never see a seed phrase) and
// the DB stores only the public address bound to the authenticated actor.
// One wallet per (actor, network). `wallet_key` is the stable derivation key
// (actor id) — deterministic address across restarts.
const UserWallet = model.define("user_wallet", {
  id: model.id().primaryKey(),
  // Which authenticated actor owns this wallet ("customer" | "seller").
  actor_type: model.text(),
  actor_id: model.text(),
  // Stable derivation key — for customers the customer id, for sellers the
  // seller-admin id. Re-derives the same address on every call.
  wallet_key: model.text(),
  network: model.text().default("arc"),
  env: model.text().default("testnet"),
  address: model.text(),
  derivation_index: model.number(),
  spends: model.hasMany(() => WalletSpend, {
    mappedBy: "wallet",
  }),
})

export default UserWallet

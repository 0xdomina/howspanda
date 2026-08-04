import { model } from "@medusajs/framework/utils"

// A payment rail's runtime on/off state. Rows are seeded from the env defaults
// (see lib/payments/rails.ts) on first boot, then toggled at runtime via the
// admin API (and reflected to the storefront). `mode` is never stored — it is
// always derived from the current env keys so a key swap can't go stale.
const PaymentRail = model.define("payment_rail", {
  id: model.id().primaryKey(),
  key: model.text().searchable().unique(),
  provider_id: model.text(),
  label: model.text(),
  kind: model.enum(["fiat-card", "crypto", "manual"]),
  enabled: model.boolean().default(true),
})

export default PaymentRail

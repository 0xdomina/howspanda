import { model } from "@medusajs/framework/utils"

export const NOTIFICATION_KINDS = [
  "store_broadcast",
  "giveaway_claimed",
] as const
export type NotificationKind = (typeof NOTIFICATION_KINDS)[number]

// One row per recipient (fan-out on write). `actor_*` snapshots the store name
// so a rename doesn't retroactively rewrite history. Broadcast body is
// sanitized at publish time (emails/phones redacted) — the platform is the only
// contact channel.
const AppNotification = model.define("app_notification", {
  id: model.id().primaryKey(),
  customer_id: model.text().searchable(),
  kind: model.enum([...NOTIFICATION_KINDS]),
  broadcast_id: model.text().nullable(),
  seller_id: model.text().nullable(),
  actor_label: model.text().nullable(),
  actor_handle: model.text().nullable(),
  title: model.text(),
  body: model.text(),
  payload: model.json().nullable(),
  read_at: model.dateTime().nullable(),
})

export default AppNotification
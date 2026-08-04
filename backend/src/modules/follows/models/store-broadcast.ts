import { model } from "@medusajs/framework/utils"

export const BROADCAST_TYPES = [
  "general",
  "product",
  "offer",
  "voucher",
  "giveaway",
] as const
export type BroadcastType = (typeof BROADCAST_TYPES)[number]

// A store owner's in-app broadcast to followers. Sent to the platform's own
// notification channel only — never email/phone. Delivery is fan-out of one
// app_notification per follower at publish time.
const StoreBroadcast = model.define("store_broadcast", {
  id: model.id().primaryKey(),
  seller_id: model.text().searchable(),
  type: model.enum([...BROADCAST_TYPES]),
  title: model.text(),
  body: model.text(),
  product_id: model.text().nullable(),
  voucher_code: model.text().nullable(),
  discount_type: model.enum(["fixed", "percent"]).nullable(),
  discount_value: model.float().nullable(),
  giveaway_claims_count: model.number().default(0),
})

export default StoreBroadcast
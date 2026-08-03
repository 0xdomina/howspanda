import { model } from "@medusajs/framework/utils"
import DeliveryOffer from "./delivery-offer"
import DeliveryParty from "./delivery-party"
import DeliveryMessage from "./delivery-message"
import DeliveryVerification from "./delivery-verification"

// A P2P delivery job — a package moved by an independent courier.
//
// Lifecycle:
//   open        — posted by a store owner from a completed order; any courier
//                 can make an offer or accept the posted price
//   negotiating — at least one counter-offer exists (still open to offers)
//   accepted    — store owner accepted an offer; price is locked
//   in_transit  — courier picked the package up
//   delivered   — recipient confirmed → escrow released to the courier wallet
//   cancelled   — pre-pickup (auto) or post-pickup with sender approval
//
// The delivery fee rides the buyer-wallet ledger (source `delivery_payout`):
// it is only credited to the courier on confirmed delivery. This mirrors the
// marketplace escrow philosophy without coupling couriers to seller accounts —
// a courier can be a store owner, a buyer, or anyone.
const DeliveryJob = model.define("delivery_job", {
  id: model.id().primaryKey(),
  // Origin order this job was posted from (kept soft — jobs can exist without
  // a linked order for manual package postings).
  order_id: model.text().nullable(),
  // Sender: the store owner who posted the job (seller id when seller-posted).
  seller_id: model.text().nullable(),
  package_description: model.text(),
  package_weight: model.text().nullable(),
  pickup_address: model.text(),
  destination_address: model.text(),
  destination_phone: model.text().nullable(),
  // Resolved coordinates (geocoded via Nominatim at post time) — the location
  // accuracy layer powering near-me/radius search and map display.
  pickup_lat: model.float().nullable(),
  pickup_lng: model.float().nullable(),
  destination_lat: model.float().nullable(),
  destination_lng: model.float().nullable(),
  // Posted price (sender's opening offer); final locked price lives on the
  // accepted offer.
  posted_price: model.bigNumber(),
  status: model
    .enum([
      "open",
      "negotiating",
      "accepted",
      "in_transit",
      "delivered",
      "cancelled",
    ])
    .default("open"),
  accepted_offer_id: model.text().nullable(),
  picked_up_at: model.dateTime().nullable(),
  delivered_at: model.dateTime().nullable(),
  cancelled_at: model.dateTime().nullable(),
  cancel_reason: model.text().nullable(),
  // Post-pickup cancellation requires explicit sender approval (inDrive pattern).
  cancel_requires_sender_approval: model.boolean().default(false),
  // Relations
  offers: model.hasMany(() => DeliveryOffer, {
    mappedBy: "job",
  }),
  parties: model.hasMany(() => DeliveryParty, {
    mappedBy: "job",
  }),
  messages: model.hasMany(() => DeliveryMessage, {
    mappedBy: "job",
  }),
  verifications: model.hasMany(() => DeliveryVerification, {
    mappedBy: "job",
  }),
})

export default DeliveryJob

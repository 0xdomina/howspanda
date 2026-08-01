import { model } from "@medusajs/framework/utils"
import DeliveryJob from "./delivery-job"

// An offer by a courier to do a job at a price. Counter-offers are NEW rows
// (immutable offer history — the sender always sees the full negotiation).
const DeliveryOffer = model.define("delivery_offer", {
  id: model.id().primaryKey(),
  job: model.belongsTo(() => DeliveryJob, {
    mappedBy: "offers",
  }),
  // Courier identity (email-based, like the buyer wallet). Any actor can offer.
  courier_email: model.text(),
  offered_price: model.bigNumber(),
  status: model
    .enum(["pending", "accepted", "rejected", "withdrawn"])
    .default("pending"),
})

export default DeliveryOffer

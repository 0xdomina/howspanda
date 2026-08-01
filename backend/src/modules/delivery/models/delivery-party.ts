import { model } from "@medusajs/framework/utils"
import DeliveryJob from "./delivery-job"

// A role-bound participant in a job. The accepted job is always a 3-way set:
//   sender    — the store owner who posted it
//   courier   — who took the job (email identity)
//   recipient — the buyer at the destination
// This roster powers the 3-way chat (Phase 12) and verification gating.
const DeliveryParty = model.define("delivery_party", {
  id: model.id().primaryKey(),
  job: model.belongsTo(() => DeliveryJob, {
    mappedBy: "parties",
  }),
  role: model.enum(["sender", "courier", "recipient"]),
  email: model.text(),
  // seller_id is set when the party is the posting store owner.
  seller_id: model.text().nullable(),
})

export default DeliveryParty

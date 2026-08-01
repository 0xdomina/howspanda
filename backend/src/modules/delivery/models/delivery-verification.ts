import { model } from "@medusajs/framework/utils"
import DeliveryJob from "./delivery-job"

// An in-app pickup/delivery verification code (no SMS/email budget — the code
// is shown inside the app to the relevant party). Only a hash is stored.
const DeliveryVerification = model.define("delivery_verification", {
  id: model.id().primaryKey(),
  job: model.belongsTo(() => DeliveryJob, {
    mappedBy: "verifications",
  }),
  purpose: model.enum(["pickup", "delivery"]),
  code_hash: model.text(),
  // last 4 chars shown in-app so the bearer can visually confirm; full match
  // is done against the hash.
  code_tail: model.text(),
  status: model.enum(["active", "used", "expired"]).default("active"),
  generated_by_email: model.text(),
  expires_at: model.dateTime(),
  used_at: model.dateTime().nullable(),
})

export default DeliveryVerification

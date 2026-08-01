import { model } from "@medusajs/framework/utils"
import DeliveryJob from "./delivery-job"

// One message in the 3-way DM for a job. REST + polling first (MVP); a WebSocket
// transport can be layered on later without changing the write path.
const DeliveryMessage = model.define("delivery_message", {
  id: model.id().primaryKey(),
  job: model.belongsTo(() => DeliveryJob, {
    mappedBy: "messages",
  }),
  sender_email: model.text(),
  body: model.text(),
  // system messages surface timeline events (job accepted, picked up, delivered)
  is_system: model.boolean().default(false),
})

export default DeliveryMessage

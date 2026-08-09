import { model } from "@medusajs/framework/utils"
import AiMessage from "./ai-message"

// One AI chat conversation, owned by exactly one actor (a customer/buyer or a
// seller). `actor_type` + `actor_id` are the hard ownership key — every
// read/write is scoped by them so no actor can ever touch another's thread.
const AiConversation = model
  .define("ai_conversation", {
    id: model.id().primaryKey(),
    actor_type: model.text(), // "customer" | "seller"
    actor_id: model.text(),
    title: model.text().nullable(),
    messages: model.hasMany(() => AiMessage, {
      mappedBy: "conversation",
    }),
  })
  .indexes([{ on: ["actor_type", "actor_id"] }])

export default AiConversation

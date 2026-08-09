import { model } from "@medusajs/framework/utils"
import AiConversation from "./ai-conversation"

// One message in an AI chat conversation. The full history is replayed to
// whichever router provider answers the current turn, so every row keeps the
// provider/model that generated it (nullable for user/system rows) plus token
// counts for the usage ledger.
const AiMessage = model.define("ai_message", {
  id: model.id().primaryKey(),
  conversation: model.belongsTo(() => AiConversation, {
    mappedBy: "messages",
  }),
  role: model.text(), // "system" | "user" | "assistant"
  content: model.text(),
  provider: model.text().nullable(),
  model_id: model.text().nullable(),
  input_tokens: model.number().nullable(),
  output_tokens: model.number().nullable(),
})

export default AiMessage

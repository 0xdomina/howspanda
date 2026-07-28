import { model } from "@medusajs/framework/utils"

// One row per successful AI action — the source of truth for quota math
// and for future paid-tier billing.
const AiUsage = model
  .define("ai_usage", {
    id: model.id().primaryKey(),
    seller_id: model.text(),
    capability: model.text(),
    model_id: model.text(),
    prompt_tokens: model.number().nullable(),
    completion_tokens: model.number().nullable(),
  })
  .indexes([{ on: ["seller_id"] }])

export default AiUsage

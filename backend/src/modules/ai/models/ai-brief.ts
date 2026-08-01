import { model } from "@medusajs/framework/utils"

// One stored seller brief (daily/weekly). The scheduled job writes it so
// GET /sellers/ai/brief is instant; numbers are deterministic JSON computed
// in code, narrative is the LLM's plain-language digest.
const AiBrief = model
  .define("ai_brief", {
    id: model.id().primaryKey(),
    seller_id: model.text(),
    period: model.text(), // "daily" | "weekly"
    period_start: model.dateTime().nullable(),
    period_end: model.dateTime().nullable(),
    numbers: model.json(),
    opportunities: model.json().nullable(),
    narrative: model.text().nullable(),
    generated_at: model.dateTime(),
  })
  .indexes([{ on: ["seller_id", "period"] }])

export default AiBrief

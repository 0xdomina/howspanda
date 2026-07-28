import { model } from "@medusajs/framework/utils"

// Optional per-seller override of the free-tier monthly limit.
// This is the hook for paid tiers later: a paid seller simply gets a
// higher monthly_limit row.
const AiQuota = model.define("ai_quota", {
  id: model.id().primaryKey(),
  seller_id: model.text().unique(),
  monthly_limit: model.number(),
})

export default AiQuota

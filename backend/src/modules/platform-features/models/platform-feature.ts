import { model } from "@medusajs/framework/utils"

// Persisted operations-control state. Definitions and safe defaults live in
// lib/features/flags.ts; this table only stores the operator's current choice.
const PlatformFeature = model.define("platform_feature", {
  id: model.id().primaryKey(),
  key: model.text().searchable().unique(),
  label: model.text(),
  description: model.text().nullable(),
  enabled: model.boolean().default(true),
})

export default PlatformFeature

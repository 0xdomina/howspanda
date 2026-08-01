import { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { AI_MODULE } from "../modules/ai"
import AiModuleService from "../modules/ai/service"
import { buildSellerAnalytics } from "../lib/ai/seller-analytics"
import { resolveSeller } from "../lib/ai/seller-context"
import { writeSellerBrief } from "../lib/ai/capabilities"

// Nightly: generate and store each seller's daily brief so
// GET /sellers/ai/brief is instant the next morning. Gated by
// AI_BRIEF_SCHEDULE_ENABLED so dev/test never burn provider calls by accident.
export default async function generateDailyBriefsJob(container: MedusaContainer) {
  if (process.env.AI_BRIEF_SCHEDULE_ENABLED !== "true") {
    return
  }

  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const aiService: AiModuleService = container.resolve(AI_MODULE)

  const { data: sellerAdmins } = await query.graph({
    entity: "seller_admin",
    fields: ["id", "seller.id", "seller.name"],
  })

  let stored = 0
  let skipped = 0
  let failed = 0

  for (const admin of sellerAdmins) {
    if (!admin?.seller?.id) {
      skipped += 1
      continue
    }
    try {
      const seller = {
        seller_admin_id: admin.id,
        seller_id: admin.seller.id,
        seller_name: admin.seller.name,
      }
      const analytics = await buildSellerAnalytics({
        query,
        seller,
        period: "daily",
      })

      // deterministic-only sellers (no orders yet) still get a stored brief,
      // but we skip the LLM call to keep the nightly run cheap.
      let narrative: string | null = null
      if (analytics.numbers.order_count > 0) {
        const output = await writeSellerBrief({
          numbersJson: JSON.stringify(analytics.numbers),
          opportunitiesJson: JSON.stringify(analytics.opportunities),
        })
        narrative = output.result
      }

      await aiService.createAiBriefs([
        {
          seller_id: seller.seller_id,
          period: "daily",
          period_start: null,
          period_end: null,
          numbers: analytics.numbers as unknown as Record<string, unknown>,
          opportunities: analytics.opportunities as unknown as Record<string, unknown>,
          narrative,
          generated_at: new Date(),
        },
      ])
      stored += 1
    } catch (e) {
      logger.warn(`generate-daily-briefs: seller ${admin?.seller?.id} failed: ${e}`)
      failed += 1
    }
  }

  logger.info(
    `generate-daily-briefs: ${stored} stored, ${skipped} skipped, ${failed} failed`
  )
}

export const config = {
  name: "generate-daily-briefs",
  schedule: "0 3 * * *",
}

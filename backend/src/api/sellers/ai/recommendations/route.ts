import { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { runAiRoute } from "../../../../lib/ai/run-ai-route"
import { explainRecommendations } from "../../../../lib/ai/capabilities"
import { buildSellerAnalytics } from "../../../../lib/ai/seller-analytics"

export const POST = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  await runAiRoute(req, res, "recommendations", async ({ query, seller }) => {
    const period: "daily" | "weekly" =
      (req.validatedBody as { period?: "daily" | "weekly" } | undefined)?.period ?? "daily"
    const analytics = await buildSellerAnalytics({ query, seller, period })

    const output = await explainRecommendations({
      opportunitiesJson: JSON.stringify(analytics.opportunities),
    })

    return { ...output, extra: { opportunities: analytics.opportunities } }
  })
}

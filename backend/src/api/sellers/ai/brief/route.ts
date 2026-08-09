import { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { runAiRoute } from "../../../../lib/ai/run-ai-route"
import { writeSellerBrief } from "../../../../lib/ai/capabilities"
import { buildSellerAnalytics } from "../../../../lib/ai/seller-analytics"
import { resolveSeller } from "../../../../lib/ai/seller-context"
import { AI_MODULE } from "../../../../modules/ai"
import AiModuleService from "../../../../modules/ai/service"
import { requireSellerPermission } from "../../../../lib/sellers/resolve-seller"

const PERIODS = ["daily", "weekly"] as const

// GET is instant and quota-free: it reads the most recently stored brief for
// the seller (the scheduled job keeps it warm). No LLM call.
export const GET = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  await requireSellerPermission(req, "ai")
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const aiService: AiModuleService = req.scope.resolve(AI_MODULE)
  const seller = await resolveSeller(query, req.auth_context.actor_id)
  const period = PERIODS.includes(req.query?.period as any)
    ? (req.query.period as (typeof PERIODS)[number])
    : "daily"

  const [brief] = await aiService.listAiBriefs(
    { seller_id: seller.seller_id, period },
    { order: { generated_at: "DESC" }, take: 1 }
  )

  res.json({ ok: true, brief: brief ?? null })
}

export const POST = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  await runAiRoute(req, res, "brief", async ({ query, seller }) => {
    const period: (typeof PERIODS)[number] =
      (req.validatedBody as { period?: "daily" | "weekly" } | undefined)?.period ?? "daily"

    const analytics = await buildSellerAnalytics({ query, seller, period })

    const output = await writeSellerBrief({
      numbersJson: JSON.stringify(analytics.numbers),
      opportunitiesJson: JSON.stringify(analytics.opportunities),
    })

    // store the brief so GET (and the schedule) are cheap
    const aiService: AiModuleService = req.scope.resolve(AI_MODULE)
    const [brief] = await aiService.createAiBriefs([
      {
        seller_id: seller.seller_id,
        period,
        period_start: null,
        period_end: null,
        numbers: analytics.numbers as unknown as Record<string, unknown>,
        opportunities: analytics.opportunities as unknown as Record<string, unknown>,
        narrative: output.result,
        generated_at: new Date(),
      },
    ])

    return { ...output, extra: { numbers: analytics.numbers, opportunities: analytics.opportunities, brief } }
  })
}

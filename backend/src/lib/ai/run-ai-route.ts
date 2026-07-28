import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { AI_MODULE } from "../../modules/ai"
import AiModuleService, {
  AiQuotaExceededError,
} from "../../modules/ai/service"
import { getModelId } from "./model"
import { AiUsageTokens } from "./capabilities"
import { resolveSeller, SellerIdentity } from "./seller-context"

type HandlerContext = {
  query: any
  seller: SellerIdentity
}

type HandlerOutput<T> = {
  result: T
  usage: AiUsageTokens
  // deterministic numbers computed in code, returned alongside the AI text
  extra?: Record<string, unknown>
}

// Shared guard for every AI route:
// - resolves the seller from the authenticated actor (hard isolation)
// - enforces quota BEFORE calling the provider (friendly 429)
// - maps any provider failure to a friendly 503 — AI never blocks commerce
// - records usage only on success
export async function runAiRoute<T>(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse,
  capability: string,
  handler: (ctx: HandlerContext) => Promise<HandlerOutput<T>>
): Promise<void> {
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const logger = req.scope.resolve(ContainerRegistrationKeys.LOGGER)
  const aiService: AiModuleService = req.scope.resolve(AI_MODULE)

  const seller = await resolveSeller(query, req.auth_context.actor_id)

  try {
    await aiService.assertQuota(seller.seller_id)
  } catch (e) {
    if (e instanceof AiQuotaExceededError) {
      res.status(429).json({
        ok: false,
        code: "quota_exhausted",
        message:
          `You've used all ${e.limit} free AI actions for this month. ` +
          `Your store keeps running as usual — AI tools unlock again next month.`,
      })
      return
    }
    throw e
  }

  try {
    const { result, usage, extra } = await handler({ query, seller })

    await aiService.recordUsage({
      seller_id: seller.seller_id,
      capability,
      model_id: getModelId(),
      prompt_tokens: usage.inputTokens ?? null,
      completion_tokens: usage.outputTokens ?? null,
    })

    const quota = await aiService.getQuotaStatus(seller.seller_id)

    res.json({ ok: true, capability, result, ...(extra ?? {}), quota })
  } catch (e) {
    logger.error(`AI capability "${capability}" failed: ${e}`)
    res.status(503).json({
      ok: false,
      code: "ai_unavailable",
      message:
        "The AI assistant is temporarily unavailable. Your store keeps " +
        "running — please try again shortly.",
    })
  }
}

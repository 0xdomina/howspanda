import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { ILockingModule } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { AI_MODULE } from "../../modules/ai"
import AiModuleService, {
  AiQuotaExceededError,
  QuotaStatus,
} from "../../modules/ai/service"
import { getModelId } from "./model"
import { AiUsageTokens } from "./capabilities"
import { resolveSeller, SellerIdentity } from "./seller-context"
import { requireSellerPermission } from "../sellers/resolve-seller"

type HandlerContext = {
  query: any
  seller: SellerIdentity
}

type HandlerOutput<T> = {
  result: T
  usage: AiUsageTokens
  modelId?: string
  // deterministic numbers computed in code, returned alongside the AI text
  extra?: Record<string, unknown>
}

// Shared guard for every AI route:
// - resolves the seller from the authenticated actor (hard isolation)
// - serializes the whole quota-check → provider → record sequence per
//   seller via the Locking Module, so concurrent requests can't slip past
//   the monthly limit between the read and the insert
// - enforces quota BEFORE calling the provider (friendly 429)
// - maps any provider failure to a friendly 503 — AI never blocks commerce
// - records usage only on success; a bookkeeping hiccup after a successful
//   provider call must never turn the response into a 503
export async function runAiRoute<T>(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse,
  capability: string,
  handler: (ctx: HandlerContext) => Promise<HandlerOutput<T>>
): Promise<void> {
  await requireSellerPermission(req, "ai")
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const logger = req.scope.resolve(ContainerRegistrationKeys.LOGGER)
  const aiService: AiModuleService = req.scope.resolve(AI_MODULE)
  const locking: ILockingModule = req.scope.resolve(Modules.LOCKING)

  const seller = await resolveSeller(query, req.auth_context.actor_id)

  await locking.execute(
    `ai-quota-${seller.seller_id}`,
    async () => {
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

      let output: HandlerOutput<T>
      try {
        output = await handler({ query, seller })
      } catch (e) {
        logger.error(`AI capability "${capability}" failed: ${e}`)
        res.status(503).json({
          ok: false,
          code: "ai_unavailable",
          message:
            "The AI assistant is temporarily unavailable. Your store keeps " +
            "running — please try again shortly.",
        })
        return
      }

      const { result, usage, extra, modelId } = output

      let quota: QuotaStatus | null = null
      try {
        await aiService.recordUsage({
          seller_id: seller.seller_id,
          capability,
            model_id: modelId ?? getModelId(),
          prompt_tokens: usage.inputTokens ?? null,
          completion_tokens: usage.outputTokens ?? null,
        })

        quota = await aiService.getQuotaStatus(seller.seller_id)
      } catch (e) {
        logger.warn(
          `AI usage bookkeeping for "${capability}" failed after a ` +
            `successful provider call: ${e}`
        )
      }

      res.json({ ok: true, capability, result, ...(extra ?? {}), quota })
    },
    { timeout: 30 }
  )
}

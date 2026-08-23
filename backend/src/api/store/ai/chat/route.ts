import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { ILockingModule } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { z } from "@medusajs/framework/zod"
import type { ModelMessage } from "ai"
import { AI_MODULE } from "../../../../modules/ai"
import AiModuleService, {
  AiQuotaExceededError,
  QuotaStatus,
} from "../../../../modules/ai/service"
import { resolveChatActor } from "../../../../lib/ai/chat-actor"
import { runRoutedChat } from "../../../../lib/ai/router/router"
import { BUYER_CHAT_SYSTEM_PROMPT } from "../../../../lib/ai/router/chat"
import { classifyBuyerIntent } from "../../../../lib/ai/buyer-context"
import {
  runBuyerCapability,
  type BuyerCapabilityOutcome,
} from "../../../../lib/ai/router/buyer-capabilities"
import { filterTextOutput } from "../../../../lib/ai/harness"
import { REVIEWS_MODULE } from "../../../../modules/reviews"
import type ReviewsModuleService from "../../../../modules/reviews/service"
import { PostAiChatSchema } from "../../../middlewares"

type Body = z.infer<typeof PostAiChatSchema>

const CHAT_SYSTEM_ROLE = "system"
const CHAT_USER_ROLE = "user"
const CHAT_ASSISTANT_ROLE = "assistant"

function buildHistory(rows: any[]): ModelMessage[] {
  return rows
    .filter((m) =>
      ["system", "user", "assistant"].includes(m.role)
    )
    .map((m) => ({ role: m.role, content: m.content }))
}

// Map a classified buyer intent to its harness capability. General chat and
// anything unrecognized return null (plain conversational turn).
function capabilityKeyForIntent(
  intent: ReturnType<typeof classifyBuyerIntent>
): string | null {
  switch (intent) {
    case "product_search":
      return "buyer_search"
    case "price_compare":
      return "buyer_price_compare"
    case "review_summary":
      return "buyer_review_summary"
    case "cart_add":
    case "cart_remove":
      return "buyer_cart_proposal"
    default:
      return null
  }
}

// Buyer-facing chat:
//  - ownership is resolved from the authenticated customer JWT actor, or from
//    a private client_key for guests (see lib/ai/chat-actor.ts)
//  - quota (AI_BUYER_CHAT_DAILY_LIMIT) is enforced BEFORE the provider call,
//    serialized per actor via the Locking Module like the seller AI guard
//  - the FULL history (system + every prior turn) is replayed to whichever
//    router provider answers; on provider failure the router fails over
//  - AI can only ever answer — it is never given a tool that mutates money,
//    orders, inventory, or payment rails
export const POST = async (
  req: AuthenticatedMedusaRequest<Body>,
  res: MedusaResponse
) => {
  const logger = req.scope.resolve(ContainerRegistrationKeys.LOGGER)
  const aiService: AiModuleService = req.scope.resolve(AI_MODULE)
  const locking: ILockingModule = req.scope.resolve(Modules.LOCKING)

  const actor = resolveChatActor(req, { body: req.validatedBody as any })
  const { conversation_id, message, title } = req.validatedBody

  await locking.execute(
    `ai-chat-quota-${actor.actorId}`,
    async () => {
      // 1. quota gate — friendly 429 before any provider call
      try {
        await aiService.assertBuyerChatQuota(actor.actorId)
      } catch (e) {
        if (e instanceof AiQuotaExceededError) {
          res.status(429).json({
            ok: false,
            code: "quota_exhausted",
            message:
              `You've used all ${e.limit} free AI chats for today. ` +
              `Everything else keeps working — chat unlocks again tomorrow.`,
          })
          return
        }
        throw e
      }

      // 2. conversation lookup (owner-scoped) or creation
      let conversation: any
      if (conversation_id) {
        conversation = await aiService.getConversation(conversation_id, actor)
      } else {
        conversation = await aiService.createConversation({
          actor,
          title: title ?? message.slice(0, 48),
        })
      }

      // 3. persist this turn + ensure the system prompt is in history
      const rows: any[] = await aiService.listMessages(conversation.id)
      if (!rows.some((m) => m.role === CHAT_SYSTEM_ROLE)) {
        await aiService.appendMessage({
          conversationId: conversation.id,
          actor,
          role: CHAT_SYSTEM_ROLE,
          content: BUYER_CHAT_SYSTEM_PROMPT,
        })
        rows.push({ role: CHAT_SYSTEM_ROLE, content: BUYER_CHAT_SYSTEM_PROMPT })
      }
      await aiService.appendMessage({
        conversationId: conversation.id,
        actor,
        role: CHAT_USER_ROLE,
        content: message,
      })
      rows.push({ role: CHAT_USER_ROLE, content: message })

      // 3.5 capability dispatch — if the message is a shopping/action request,
      // run the matching read-only capability against REAL catalog/review data
      // so the assistant's answer is grounded (never hallucinated) and cart
      // changes come back as a PROPOSAL the buyer must approve in the UI.
      const intent = classifyBuyerIntent(message)
      const capabilityKey = capabilityKeyForIntent(intent)

      let capability: BuyerCapabilityOutcome | null = null
      if (capabilityKey) {
        try {
          capability = await runBuyerCapability(capabilityKey, intent, message, {
            query: req.scope.resolve(ContainerRegistrationKeys.QUERY),
            reviews: req.scope.resolve<ReviewsModuleService>(REVIEWS_MODULE),
          })
        } catch (e) {
          // A reader miss (e.g. no catalog match) degrades to a normal chat
          // turn — the assistant simply says it couldn't find anything.
          logger.warn(
            `Buyer capability "${capabilityKey}" for ${actor.actorId} failed: ${e}`
          )
        }
      }

      const groundedContext = capability
        ? JSON.stringify(capability.result)
        : null

      const history = buildHistory(rows)

      // 4. route the turn (full history → failover across providers). When a
      // capability ran, its grounded result is appended as a system-scoped
      // context block (kept out of the attacker-controllable user stream, and
      // never trusted from history — the router always rebuilds it).
      let result: Awaited<ReturnType<typeof runRoutedChat>>
      try {
        result = await runRoutedChat({
          messages: groundedContext
            ? [
                ...history,
                { role: CHAT_SYSTEM_ROLE, content: groundedContext },
              ]
            : history,
          key: conversation.id,
        })
      } catch (e) {
        logger.error(`AI chat failed for actor ${actor.actorId}: ${e}`)
        res.status(503).json({
          ok: false,
          code: "ai_unavailable",
          message:
            "The AI assistant is temporarily unavailable. Everything else keeps " +
            "working — please try again shortly.",
        })
        return
      }

      // 5. output contract + persist the reply + record usage
      const reply = filterTextOutput("chat", result.text)

      let quota: QuotaStatus | null = null
      try {
        await aiService.appendMessage({
          conversationId: conversation.id,
          actor,
          role: CHAT_ASSISTANT_ROLE,
          content: reply,
          provider: result.provider,
          modelId: result.modelId,
          inputTokens: result.usage.inputTokens,
          outputTokens: result.usage.outputTokens,
        })
        await aiService.recordChatUsage({
          actor,
          modelId: result.modelId,
          promptTokens: result.usage.inputTokens,
          completionTokens: result.usage.outputTokens,
        })
        quota = await aiService.getBuyerChatQuota(actor.actorId)
      } catch (e) {
        logger.warn(
          `AI chat bookkeeping for ${actor.actorId} failed after a ` +
            `successful provider call: ${e}`
        )
      }

      res.json({
        ok: true,
        conversation_id: conversation.id,
        reply,
        provider: result.provider,
        model_id: result.modelId,
        capability: capability?.capability ?? null,
        result: capability?.result ?? null,
        proposal: capability?.proposal ?? null,
        quota,
      })
    },
    { timeout: 60 }
  )
}

// Message history for one conversation, owner-scoped (404 when the caller
// does not own the thread).
export const GET = async (
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) => {
  const aiService: AiModuleService = req.scope.resolve(AI_MODULE)
  const actor = resolveChatActor(req, { query: req.query as any })

  const conversationId = (req.query?.conversation_id as string)?.trim()
  if (!conversationId) {
    res.status(400).json({ ok: false, code: "invalid_data", message: "conversation_id is required" })
    return
  }

  const conversation = await aiService.getConversation(conversationId, actor)
  const messages = await aiService.listMessages(conversation.id)

  res.json({
    ok: true,
    conversation: {
      id: conversation.id,
      title: conversation.title,
    },
    messages: messages.map((m) => ({
      role: m.role,
      content: m.content,
      provider: m.provider,
      model_id: m.model_id,
      created_at: m.created_at,
    })),
  })
}

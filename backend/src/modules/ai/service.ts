import { MedusaError, MedusaService } from "@medusajs/framework/utils"
import AiUsage from "./models/ai-usage"
import AiQuota from "./models/ai-quota"
import AiBrief from "./models/ai-brief"
import AiConversation from "./models/ai-conversation"
import AiMessage from "./models/ai-message"
import { ChatActor } from "../../lib/ai/chat-actor"

export class AiQuotaExceededError extends Error {
  constructor(public readonly limit: number) {
    super(`AI monthly quota of ${limit} actions exhausted`)
    this.name = "AiQuotaExceededError"
  }
}

const DEFAULT_MONTHLY_LIMIT = 100
const DEFAULT_BUYER_CHAT_DAILY_LIMIT = 30

export type QuotaStatus = {
  used: number
  limit: number
  remaining: number
}

class AiModuleService extends MedusaService({
  AiUsage,
  AiQuota,
  AiBrief,
  AiConversation,
  AiMessage,
}) {
  protected defaultMonthlyLimit(): number {
    const parsed = parseInt(process.env.AI_FREE_TIER_MONTHLY_LIMIT || "", 10)
    return Number.isFinite(parsed) && parsed > 0
      ? parsed
      : DEFAULT_MONTHLY_LIMIT
  }

  protected buyerChatDailyLimit(): number {
    const parsed = parseInt(process.env.AI_BUYER_CHAT_DAILY_LIMIT || "", 10)
    return Number.isFinite(parsed) && parsed > 0
      ? parsed
      : DEFAULT_BUYER_CHAT_DAILY_LIMIT
  }

  async getMonthlyLimit(sellerId: string): Promise<number> {
    const [override] = await this.listAiQuotas({ seller_id: sellerId })
    return override?.monthly_limit ?? this.defaultMonthlyLimit()
  }

  async getQuotaStatus(sellerId: string): Promise<QuotaStatus> {
    const monthStart = new Date()
    monthStart.setUTCDate(1)
    monthStart.setUTCHours(0, 0, 0, 0)

    const [, used] = await this.listAndCountAiUsages({
      seller_id: sellerId,
      created_at: { $gte: monthStart },
    })

    const limit = await this.getMonthlyLimit(sellerId)

    return { used, limit, remaining: Math.max(0, limit - used) }
  }

  async assertQuota(sellerId: string): Promise<QuotaStatus> {
    const status = await this.getQuotaStatus(sellerId)

    if (status.remaining <= 0) {
      throw new AiQuotaExceededError(status.limit)
    }

    return status
  }

  async recordUsage(data: {
    seller_id: string
    capability: string
    model_id: string
    prompt_tokens?: number | null
    completion_tokens?: number | null
  }) {
    return await this.createAiUsages(data)
  }

  // ---- Chat: conversations + messages -----------------------------------

  async createConversation(input: {
    actor: ChatActor
    title?: string | null
  }) {
    return await this.createAiConversations({
      actor_type: input.actor.actorType,
      actor_id: input.actor.actorId,
      title: input.title ?? null,
    })
  }

  /**
   * A conversation is only readable/writable by its owning actor — the WHERE
   * clause carries the actor key, so a foreign conversation_id resolves to
   * zero rows and surfaces as a NOT_FOUND (never as someone else's data).
   */
  async getConversation(
    conversationId: string,
    actor: ChatActor
  ): Promise<any> {
    const [conversation] = await this.listAiConversations({
      id: conversationId,
      actor_type: actor.actorType,
      actor_id: actor.actorId,
    })
    if (!conversation) {
      throw new MedusaError(
        MedusaError.Types.NOT_FOUND,
        "Conversation not found"
      )
    }
    return conversation
  }

  async listConversations(actor: ChatActor) {
    const conversations = await this.listAiConversations(
      { actor_type: actor.actorType, actor_id: actor.actorId },
      { order: { updated_at: "DESC" }, take: 50 }
    )
    return conversations.map((c) => ({
      id: c.id,
      title: c.title,
      updated_at: c.updated_at,
    }))
  }

  async appendMessage(input: {
    conversationId: string
    actor: ChatActor
    role: "system" | "user" | "assistant"
    content: string
    provider?: string | null
    modelId?: string | null
    inputTokens?: number | null
    outputTokens?: number | null
  }) {
    // Ownership gate: throws NOT_FOUND when the thread belongs to someone else.
    await this.getConversation(input.conversationId, input.actor)
    return await this.createAiMessages({
      conversation_id: input.conversationId,
      role: input.role,
      content: input.content,
      provider: input.provider ?? null,
      model_id: input.modelId ?? null,
      input_tokens: input.inputTokens ?? null,
      output_tokens: input.outputTokens ?? null,
    })
  }

  async listMessages(conversationId: string) {
    return await this.listAiMessages(
      { conversation_id: conversationId },
      { order: { created_at: "ASC" } }
    )
  }

  async countMessages(conversationId: string): Promise<number> {
    const [, count] = await this.listAndCountAiMessages({
      conversation_id: conversationId,
    })
    return count
  }

  // ---- Chat: usage ledger -----------------------------------------------

  /**
   * Record a routed chat turn against the shared ai_usage ledger. The actor id
   * is stored in the opaque `seller_id` column (it is a plain text key, not a
   * FK) so the existing ledger math extends to chat without a schema change.
   */
  async recordChatUsage(input: {
    actor: ChatActor
    modelId: string
    promptTokens?: number | null
    completionTokens?: number | null
  }) {
    const capability =
      input.actor.actorType === "seller" ? "seller_chat" : "buyer_chat"
    return await this.createAiUsages({
      seller_id: input.actor.actorId,
      capability,
      model_id: input.modelId,
      prompt_tokens: input.promptTokens ?? null,
      completion_tokens: input.completionTokens ?? null,
    })
  }

  /** Daily buyer-chat quota, keyed by the actor id in the usage ledger. */
  async getBuyerChatQuota(actorId: string): Promise<QuotaStatus> {
    const dayStart = new Date()
    dayStart.setUTCHours(0, 0, 0, 0)

    const [, used] = await this.listAndCountAiUsages({
      seller_id: actorId,
      capability: "buyer_chat",
      created_at: { $gte: dayStart },
    })

    const limit = this.buyerChatDailyLimit()
    return { used, limit, remaining: Math.max(0, limit - used) }
  }

  async assertBuyerChatQuota(actorId: string): Promise<QuotaStatus> {
    const status = await this.getBuyerChatQuota(actorId)
    if (status.remaining <= 0) {
      throw new AiQuotaExceededError(status.limit)
    }
    return status
  }
}

export default AiModuleService

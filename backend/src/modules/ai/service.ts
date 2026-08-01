import { MedusaService } from "@medusajs/framework/utils"
import AiUsage from "./models/ai-usage"
import AiQuota from "./models/ai-quota"
import AiBrief from "./models/ai-brief"

export class AiQuotaExceededError extends Error {
  constructor(public readonly limit: number) {
    super(`AI monthly quota of ${limit} actions exhausted`)
    this.name = "AiQuotaExceededError"
  }
}

const DEFAULT_MONTHLY_LIMIT = 100

export type QuotaStatus = {
  used: number
  limit: number
  remaining: number
}

class AiModuleService extends MedusaService({ AiUsage, AiQuota, AiBrief }) {
  protected defaultMonthlyLimit(): number {
    const parsed = parseInt(process.env.AI_FREE_TIER_MONTHLY_LIMIT || "", 10)
    return Number.isFinite(parsed) && parsed > 0
      ? parsed
      : DEFAULT_MONTHLY_LIMIT
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
}

export default AiModuleService

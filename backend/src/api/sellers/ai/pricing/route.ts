import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { z } from "@medusajs/framework/zod"
import { runAiRoute } from "../../../../lib/ai/run-ai-route"
import {
  suggestPricing,
  MarketPriceStats,
} from "../../../../lib/ai/capabilities"
import { PostAiPricingSchema } from "../../../middlewares"

type Body = z.infer<typeof PostAiPricingSchema>

// Aggregated, anonymized marketplace stats — the advisor never sees
// individual competitors, only min/median/max in the same currency.
async function getMarketPriceStats(
  query: any,
  currencyCode: string
): Promise<MarketPriceStats> {
  const { data: prices } = await query.graph({
    entity: "price",
    fields: ["amount", "currency_code"],
    filters: { currency_code: currencyCode },
  })

  const amounts = (prices ?? [])
    .map((p: any) => Number(p.amount))
    .filter((n: number) => Number.isFinite(n) && n > 0)
    .sort((a: number, b: number) => a - b)

  if (!amounts.length) {
    return {
      currency_code: currencyCode,
      sample_size: 0,
      min: null,
      median: null,
      max: null,
    }
  }

  return {
    currency_code: currencyCode,
    sample_size: amounts.length,
    min: amounts[0],
    median: amounts[Math.floor(amounts.length / 2)],
    max: amounts[amounts.length - 1],
  }
}

export const POST = async (
  req: AuthenticatedMedusaRequest<Body>,
  res: MedusaResponse
) => {
  await runAiRoute(req, res, "pricing", async ({ query }) => {
    const currency = req.validatedBody.currency_code
    const market = await getMarketPriceStats(query, currency)

    const output = await suggestPricing({
      title: req.validatedBody.title,
      category: req.validatedBody.category,
      cost: req.validatedBody.cost,
      currency_code: currency,
      market,
    })

    return { ...output, extra: { market } }
  })
}

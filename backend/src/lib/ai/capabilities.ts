import { generateObject, generateText } from "ai"
import { z } from "zod"
import { getModel } from "./model"

export type AiUsageTokens = {
  inputTokens?: number
  outputTokens?: number
}

export type CapabilityOutput<T> = {
  result: T
  usage: AiUsageTokens
}

// ---------- listing writer ----------

export const ListingResultSchema = z.object({
  title: z.string(),
  description: z.string(),
  tags: z.array(z.string()),
  seo_title: z.string(),
  seo_description: z.string(),
})

export type ListingResult = z.infer<typeof ListingResultSchema>

export async function generateListing(input: {
  notes: string
  category?: string
}): Promise<CapabilityOutput<ListingResult>> {
  const { object, usage } = await generateObject({
    model: getModel(),
    schema: ListingResultSchema,
    system:
      "[capability:listing] You write compelling, honest e-commerce product " +
      "listings for an African marketplace. Plain language, no hype words, " +
      "no invented specifications.",
    prompt:
      `Write a product listing from these rough seller notes:\n` +
      `Notes: ${input.notes}\n` +
      (input.category ? `Category: ${input.category}\n` : ""),
  })

  return {
    result: object,
    usage: { inputTokens: usage.inputTokens, outputTokens: usage.outputTokens },
  }
}

// ---------- pricing advisor ----------

export const PricingResultSchema = z.object({
  suggested_price: z.number(),
  floor_price: z.number(),
  ceiling_price: z.number(),
  reasoning: z.string(),
})

export type PricingResult = z.infer<typeof PricingResultSchema>

export type MarketPriceStats = {
  currency_code: string
  sample_size: number
  min: number | null
  median: number | null
  max: number | null
}

export async function suggestPricing(input: {
  title: string
  category?: string
  cost?: number
  currency_code: string
  market: MarketPriceStats
}): Promise<CapabilityOutput<PricingResult>> {
  const { object, usage } = await generateObject({
    model: getModel(),
    schema: PricingResultSchema,
    system:
      "[capability:pricing] You are a pricing advisor for marketplace " +
      "sellers. Recommend realistic prices in the given currency's minor " +
      "units, grounded in the aggregated marketplace statistics provided. " +
      "Never reference individual competitors.",
    prompt:
      `Product: ${input.title}\n` +
      (input.category ? `Category: ${input.category}\n` : "") +
      (input.cost != null ? `Seller's unit cost: ${input.cost}\n` : "") +
      `Currency: ${input.currency_code}\n` +
      `Aggregated marketplace price stats (same currency): ` +
      `${JSON.stringify(input.market)}\n` +
      `Suggest a price, a floor, and a ceiling.`,
  })

  return {
    result: object,
    usage: { inputTokens: usage.inputTokens, outputTokens: usage.outputTokens },
  }
}

// ---------- business insights ----------

export async function answerInsightsQuestion(input: {
  question: string
  contextJson: string
}): Promise<CapabilityOutput<string>> {
  const { text, usage } = await generateText({
    model: getModel(),
    system:
      "[capability:insights] You answer business questions for ONE " +
      "marketplace seller using ONLY the seller data provided in the " +
      "prompt. If the data cannot answer the question, say so plainly. " +
      "Never invent numbers.",
    prompt:
      `Seller data (JSON):\n${input.contextJson}\n\n` +
      `Question: ${input.question}`,
  })

  return {
    result: text,
    usage: { inputTokens: usage.inputTokens, outputTokens: usage.outputTokens },
  }
}

// ---------- accounting summary ----------

export async function writeAccountingDigest(input: {
  aggregatesJson: string
}): Promise<CapabilityOutput<string>> {
  const { text, usage } = await generateText({
    model: getModel(),
    system:
      "[capability:accounting] You explain a marketplace seller's earnings " +
      "in plain language: gross revenue, platform commission deducted, and " +
      "net earnings, per currency and per month. Use ONLY the numbers " +
      "provided — never invent or extrapolate figures.",
    prompt: `Earnings aggregates (JSON):\n${input.aggregatesJson}`,
  })

  return {
    result: text,
    usage: { inputTokens: usage.inputTokens, outputTokens: usage.outputTokens },
  }
}

// ---------- marketing coach ----------

export const MarketingResultSchema = z.object({
  brand_voice: z.string(),
  promo_ideas: z.array(z.string()),
  bundle_suggestions: z.array(z.string()),
})

export type MarketingResult = z.infer<typeof MarketingResultSchema>

export async function coachMarketing(input: {
  goal?: string
  tone?: string
  productsJson: string
}): Promise<CapabilityOutput<MarketingResult>> {
  const { object, usage } = await generateObject({
    model: getModel(),
    schema: MarketingResultSchema,
    system:
      "[capability:marketing] You are a marketing coach for small " +
      "marketplace sellers. Ground every suggestion in the seller's actual " +
      "catalog provided in the prompt. Practical, low-budget ideas only.",
    prompt:
      (input.goal ? `Seller goal: ${input.goal}\n` : "") +
      (input.tone ? `Preferred tone: ${input.tone}\n` : "") +
      `Seller catalog (JSON):\n${input.productsJson}`,
  })

  return {
    result: object,
    usage: { inputTokens: usage.inputTokens, outputTokens: usage.outputTokens },
  }
}

import { createGroq } from "@ai-sdk/groq"
import type { LanguageModelV2 } from "@ai-sdk/provider"
import { LanguageModel } from "ai"

export class AiUnavailableError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "AiUnavailableError"
  }
}

export const DEFAULT_AI_MODEL = "llama-3.3-70b-versatile"

export function getModelId(): string {
  const provider = process.env.AI_PROVIDER || "groq"
  if (provider === "mock" || provider === "mock-fail") {
    return provider
  }
  // unknown providers never reach the usage ledger — getModel() throws first
  return process.env.AI_MODEL || DEFAULT_AI_MODEL
}

// Canned outputs for the deterministic mock provider. Structured
// capabilities get schema-conforming JSON; text capabilities get prose.
const CANNED_OUTPUTS: Record<string, string> = {
  listing: JSON.stringify({
    title: "Handwoven Ankara Tote Bag",
    description:
      "A clear product description for your listing.",
    tags: ["ankara", "tote", "handmade"],
    seo_title: "Handwoven Ankara Tote Bag | How's u",
    seo_description: "A search-friendly description for your product listing.",
  }),
  pricing: JSON.stringify({
    suggested_price: 12000,
    floor_price: 9000,
    ceiling_price: 15000,
    reasoning: "A suggested range based on comparable marketplace prices.",
  }),
  marketing: JSON.stringify({
    brand_voice: "Warm, confident, and proudly local.",
    promo_ideas: ["Create a limited-time offer", "Pair it with a complementary item"],
    bundle_suggestions: ["Pair this with a complementary item"],
  }),
  insights: "Your sales insights will appear here as orders come in.",
  accounting:
    "Your revenue, commission, and net earnings summary.",
  brief:
    "A summary of your revenue and net earnings.",
  recommendations: JSON.stringify({
    opportunities: [
      { action: "bundle", sku: "A + B", explanation: "Pair complementary products in one offer." },
    ],
  }),
}

// Capabilities defined outside model.ts (buyer AI, chat, etc.) register their
// mock outputs here so the deterministic provider stays in sync without every
// module editing model.ts.
const EXTRA_CANNED_OUTPUTS = new Map<string, string>()

export function registerMockOutput(capability: string, output: string): void {
  EXTRA_CANNED_OUTPUTS.set(capability, output)
}

// Every capability's system prompt begins with "[capability:<name>]" so the
// mock can return the right canned shape.
function detectCapability(prompt: unknown): string {
  const serialized = JSON.stringify(prompt)
  const match = /\[capability:(\w+)\]/.exec(serialized)
  return match?.[1] ?? "insights"
}

function cannedFor(capability: string): string {
  return EXTRA_CANNED_OUTPUTS.get(capability) ?? CANNED_OUTPUTS[capability] ?? ""
}

// Hand-rolled LanguageModelV2 instead of `ai/test`'s MockLanguageModelV2:
// that entrypoint requires msw/vitest, which cannot load in Medusa's
// CommonJS runtime. Behavior is identical for doGenerate.
function buildMockModel(fail: boolean): LanguageModelV2 {
  return {
    specificationVersion: "v2",
    provider: "mock",
    modelId: "mock-model",
    supportedUrls: {},
    doGenerate: async (options) => {
      // expose the exact prompt for isolation assertions in tests
      ;(globalThis as any).__howsuLastAiPrompt = JSON.stringify(options.prompt)

      if (fail) {
        throw new AiUnavailableError("mock provider forced failure")
      }

      const capability = detectCapability(options.prompt)

      return {
        finishReason: "stop" as const,
        usage: { inputTokens: 10, outputTokens: 20, totalTokens: 30 },
        content: [
          { type: "text" as const, text: cannedFor(capability) },
        ],
        warnings: [],
      }
    },
    doStream: async () => {
      throw new AiUnavailableError("mock provider does not support streaming")
    },
  }
}

export function getModel(): LanguageModel {
  const provider = process.env.AI_PROVIDER || "groq"

  if (provider === "mock") {
    return buildMockModel(false)
  }
  if (provider === "mock-fail") {
    return buildMockModel(true)
  }
  if (provider !== "groq") {
    throw new AiUnavailableError(`Unknown AI_PROVIDER "${provider}"`)
  }

  const apiKey = process.env.GROQ_API_KEY
  if (!apiKey) {
    throw new AiUnavailableError(
      "GROQ_API_KEY is not configured — AI features are disabled"
    )
  }

  const groq = createGroq({ apiKey })
  return groq(process.env.AI_MODEL || DEFAULT_AI_MODEL)
}

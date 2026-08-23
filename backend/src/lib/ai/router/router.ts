import { generateText } from "ai"
import type { ModelMessage, LanguageModel } from "ai"
import { AiUnavailableError } from "../model"
import {
  getEnabledProviders,
  getProvider,
  type ModelProvider,
} from "./providers"

// The model router.
//
// Strategy (AI_ROUTER_STRATEGY, default "round-robin"):
//   round-robin — each call advances a per-conversation cursor so consecutive
//     messages in a thread are answered by different providers. On provider
//     error/rate-limit the call fails over to the next enabled provider.
//   failover    — always prefer the provider that last succeeded for the
//     conversation; on error try the next provider in the enabled order.
//
// The cursor/last-success state is keyed per conversation so one thread's
// rotation never interferes with another's.

export type RouterStrategy = "round-robin" | "failover"

const ROUND_ROBIN_CURSOR = new Map<string, number>()
const LAST_SUCCESS = new Map<string, number>()

export function getRouterStrategy(): RouterStrategy {
  const raw = (process.env.AI_ROUTER_STRATEGY || "round-robin").toLowerCase()
  return raw === "failover" ? "failover" : "round-robin"
}

export type RoutedModel = {
  model: LanguageModel
  provider: string
  modelId: string
}

function providersToTry(
  strategy: RouterStrategy,
  key: string,
  filter?: string[]
): ModelProvider[] {
  let pool = getEnabledProviders()
  if (filter && filter.length) {
    const wanted = new Set(filter.map((f) => f.toLowerCase()))
    pool = pool.filter((p) => wanted.has(p.id))
  }
  if (!pool.length) {
    throw new AiUnavailableError(
      `No enabled router providers${filter?.length ? ` (filtered: ${filter.join(",")})` : ""}`
    )
  }

  let start: number
  if (strategy === "failover") {
    start = LAST_SUCCESS.get(key) ?? 0
  } else {
    start = ROUND_ROBIN_CURSOR.get(key) ?? 0
  }

  // Build the ordered attempt list: [start, start+1, ..., len-1, 0, ..., start-1]
  const ordered: ModelProvider[] = []
  for (let i = 0; i < pool.length; i++) {
    ordered.push(pool[(start + i) % pool.length])
  }
  return ordered
}

/**
 * Return the model for the next provider per the active strategy. Advances the
 * round-robin cursor (per `key`/conversation) so the following call lands on a
 * different provider. `providerFilter` narrows the pool (internal/test use).
 */
export function getRoutedModel(
  opts: { key?: string; providerFilter?: string[] } = {}
): RoutedModel {
  const strategy = getRouterStrategy()
  const key = opts.key ?? "default"
  const providers = providersToTry(strategy, key, opts.providerFilter)
  const target = providers[0]

  if (strategy !== "failover") {
    // round-robin: advance the cursor for the next message
    ROUND_ROBIN_CURSOR.set(key, (ROUND_ROBIN_CURSOR.get(key) ?? 0) + 1)
  }

  return {
    model: target.resolve(),
    provider: target.id,
    modelId: target.modelId,
  }
}

export type RoutedChatInput = {
  /** Full conversation history, including the system message. */
  messages: ModelMessage[]
  providerFilter?: string[]
  /** Conversation id — per-thread cursor/last-success state. */
  key?: string
}

export type RoutedChatResult = {
  text: string
  provider: string
  modelId: string
  usage: { inputTokens?: number; outputTokens?: number }
  /** Providers that were attempted before the one that answered. */
  failedProviders: string[]
}

/**
 * Run one chat turn through the router with failover. Every attempted provider
 * receives the FULL message history, so any of them can continue the thread.
 * When every provider fails, the last error is thrown (the route maps it to a
 * friendly 503 — AI never blocks commerce).
 */
export async function runRoutedChat(
  input: RoutedChatInput
): Promise<RoutedChatResult> {
  const strategy = getRouterStrategy()
  const key = input.key ?? "default"
  const providers = providersToTry(strategy, key, input.providerFilter)
  const failedProviders: string[] = []
  let lastError: unknown

  // The system prompt must come from our own capability registry, never from
  // the conversation history — pass it via the dedicated `system` option so
  // the AI SDK keeps it out of the attacker-controllable message stream.
  const system = input.messages
    .filter((m) => m.role === "system")
    .map((m) => (typeof m.content === "string" ? m.content : ""))
    .join("\n")
  const messages = input.messages.filter((m) => m.role !== "system")

  for (const provider of providers) {
    try {
      const { text, usage } = await generateText({
        model: provider.resolve(),
        ...(system ? { system } : {}),
        messages,
      })

      const pool = getEnabledProviders()

      if (strategy === "failover") {
        LAST_SUCCESS.set(key, pool.findIndex((p) => p.id === provider.id))
      } else {
        // point the cursor AFTER the answering provider so the next message in
        // the thread starts at a different provider even after a failover
        ROUND_ROBIN_CURSOR.set(key, (pool.findIndex((p) => p.id === provider.id) + 1) % pool.length)
      }

      return {
        text,
        provider: provider.id,
        modelId: provider.modelId,
        usage: {
          inputTokens: usage.inputTokens,
          outputTokens: usage.outputTokens,
        },
        failedProviders,
      }
    } catch (e) {
      lastError = e
      failedProviders.push(provider.id)
    }
  }

  if (lastError instanceof AiUnavailableError) {
    throw lastError
  }
  throw new AiUnavailableError(
    `All router providers failed: ${failedProviders.join(", ")} — ${String(lastError)}`
  )
}

/** Helper for callers that only need a single next model. */
export function getProviderModel(id: string): RoutedModel {
  const provider = getProvider(id)
  return { model: provider.resolve(), provider: provider.id, modelId: provider.modelId }
}

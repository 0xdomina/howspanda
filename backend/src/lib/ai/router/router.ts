import { generateObject, generateText } from "../sdk"
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
const MAX_ROUTER_KEYS = 10_000

function setRouterState(map: Map<string, number>, key: string, value: number) {
  map.delete(key)
  map.set(key, value)
  while (map.size > MAX_ROUTER_KEYS) {
    const oldest = map.keys().next().value
    if (!oldest) break
    map.delete(oldest)
  }
}

export function getRouterStrategy(): RouterStrategy {
  const raw = (process.env.AI_ROUTER_STRATEGY || "failover").toLowerCase()
  return raw === "failover" ? "failover" : "round-robin"
}

export type RoutedModel = {
  model: Promise<unknown>
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
    setRouterState(ROUND_ROBIN_CURSOR, key, (ROUND_ROBIN_CURSOR.get(key) ?? 0) + 1)
  }

  return {
    model: target.resolve(),
    provider: target.id,
    modelId: target.modelId,
  }
}

export type RoutedChatInput = {
  /** Full conversation history, including the system message. */
  messages: Array<{
    role: "system" | "user" | "assistant"
    content: string
  }>
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
        model: await provider.resolve(),
        ...(system ? { system } : {}),
        messages,
        maxOutputTokens: Number(process.env.AI_CHAT_MAX_OUTPUT_TOKENS || 600),
        abortSignal: AbortSignal.timeout(
          Number(process.env.AI_REQUEST_TIMEOUT_MS || 30_000)
        ),
      })

      const pool = getEnabledProviders()

      if (strategy === "failover") {
        setRouterState(LAST_SUCCESS, key, pool.findIndex((p) => p.id === provider.id))
      } else {
        // point the cursor AFTER the answering provider so the next message in
        // the thread starts at a different provider even after a failover
        setRouterState(
          ROUND_ROBIN_CURSOR,
          key,
          (pool.findIndex((p) => p.id === provider.id) + 1) % pool.length
        )
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
    `All configured AI providers failed after ${failedProviders.length} attempt(s)`
  )
}

/** Helper for callers that only need a single next model. */
export async function getProviderModel(id: string): Promise<RoutedModel> {
  const provider = getProvider(id)
  return { model: provider.resolve(), provider: provider.id, modelId: provider.modelId }
}

export type RoutedGenerationResult<T> = {
  result: T
  provider: string
  modelId: string
  usage: { inputTokens?: number; outputTokens?: number }
  failedProviders: string[]
}

function recordProviderSuccess(strategy: RouterStrategy, key: string, providerId: string) {
  const pool = getEnabledProviders()
  const index = pool.findIndex((provider) => provider.id === providerId)
  if (strategy === "failover") {
    setRouterState(LAST_SUCCESS, key, index)
  } else if (pool.length) {
    setRouterState(ROUND_ROBIN_CURSOR, key, (index + 1) % pool.length)
  }
}

/** Structured seller capabilities use the same hidden provider pool as buyer
 * chat. Providers see only the capability prompt; the client receives no
 * provider/model identity. */
export async function runRoutedObject<T>(input: {
  capability: string
  schema: unknown
  system: string
  prompt: string
  key?: string
  providerFilter?: string[]
}): Promise<RoutedGenerationResult<T>> {
  const strategy = getRouterStrategy()
  const key = input.key ?? `capability:${input.capability}`
  const providers = providersToTry(strategy, key, input.providerFilter)
  const failedProviders: string[] = []
  let lastError: unknown
  for (const provider of providers) {
    try {
      const { object, usage } = await generateObject({
        model: await provider.resolve(),
        schema: input.schema,
        system: input.system,
        prompt: input.prompt,
        maxOutputTokens: Number(process.env.AI_CHAT_MAX_OUTPUT_TOKENS || 600),
        abortSignal: AbortSignal.timeout(Number(process.env.AI_REQUEST_TIMEOUT_MS || 30_000)),
      })
      recordProviderSuccess(strategy, key, provider.id)
      return {
        result: object as T,
        provider: provider.id,
        modelId: provider.modelId,
        usage: { inputTokens: usage.inputTokens, outputTokens: usage.outputTokens },
        failedProviders,
      }
    } catch (error) {
      lastError = error
      failedProviders.push(provider.id)
    }
  }
  if (lastError instanceof AiUnavailableError) throw lastError
  throw new AiUnavailableError(`All configured AI providers failed for ${input.capability}`)
}

export async function runRoutedText(input: {
  capability: string
  system: string
  prompt: string
  key?: string
  providerFilter?: string[]
}): Promise<RoutedGenerationResult<string>> {
  const strategy = getRouterStrategy()
  const key = input.key ?? `capability:${input.capability}`
  const providers = providersToTry(strategy, key, input.providerFilter)
  const failedProviders: string[] = []
  let lastError: unknown
  for (const provider of providers) {
    try {
      const { text, usage } = await generateText({
        model: await provider.resolve(),
        system: input.system,
        prompt: input.prompt,
        maxOutputTokens: Number(process.env.AI_CHAT_MAX_OUTPUT_TOKENS || 600),
        abortSignal: AbortSignal.timeout(Number(process.env.AI_REQUEST_TIMEOUT_MS || 30_000)),
      })
      recordProviderSuccess(strategy, key, provider.id)
      return {
        result: text,
        provider: provider.id,
        modelId: provider.modelId,
        usage: { inputTokens: usage.inputTokens, outputTokens: usage.outputTokens },
        failedProviders,
      }
    } catch (error) {
      lastError = error
      failedProviders.push(provider.id)
    }
  }
  if (lastError instanceof AiUnavailableError) throw lastError
  throw new AiUnavailableError(`All configured AI providers failed for ${input.capability}`)
}

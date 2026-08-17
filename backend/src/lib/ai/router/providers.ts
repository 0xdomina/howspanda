import { AiUnavailableError, DEFAULT_AI_MODEL, getModel } from "../model"

// Env-driven provider registry for the model router.
//
//  - groq     : @ai-sdk/groq, model from AI_MODEL (default llama-3.3-70b-versatile)
//  - deepseek : @ai-sdk/deepseek, model from DEEPSEEK_MODEL (default deepseek-chat)
//  - openai-compatible extras (NVIDIA NIM, vLLM, Ollama, ...): any provider that
//    exposes an OpenAI-compatible /chat/completions endpoint. Configured entirely
//    through AI_ROUTER_EXTRA_PROVIDERS as a JSON array (see parseExtraProviders).
//
// When AI_PROVIDER=mock|mock-fail EVERY provider resolves to the deterministic
// mock/fail model, so integration tests stay offline-deterministic regardless of
// how many providers are enabled.

export type ModelProvider = {
  id: string
  label: string
  modelId: string
  /** Resolve the concrete model for this provider RIGHT NOW. */
  resolve: () => Promise<unknown>
}

export type ExtraProviderConfig = {
  /** Unique id — the key referenced in AI_ROUTER_PROVIDERS. */
  id: string
  /** Model id sent to the endpoint, e.g. "nvidia/nemotron-4-340b-instruct". */
  model: string
  /** Full OpenAI-compatible base URL, e.g. "https://integrate.api.nvidia.com/v1". */
  baseURL: string
  /** Optional bearer API key. Some free endpoints need none. */
  apiKey?: string
  /** Optional extra headers, e.g. { "X-API-Key": "..." } for key-in-header APIs. */
  headers?: Record<string, string>
}

/**
 * Parse AI_ROUTER_EXTRA_PROVIDERS. Format is a JSON array of
 * ExtraProviderConfig objects:
 *
 *   AI_ROUTER_EXTRA_PROVIDERS=[
 *     {"id":"nvidia","model":"nvidia/nemotron-4-340b-instruct",
 *      "baseURL":"https://integrate.api.nvidia.com/v1","apiKey":"nvapi-..."},
 *     {"id":"local","model":"qwen2.5:7b","baseURL":"http://localhost:11434/v1"}
 *   ]
 *
 * Invalid entries are skipped so one bad row cannot take down the whole router.
 * (The array on one line avoids shell/`.env` multiline headaches; any
 * whitespace inside is stripped.)
 */
export function parseExtraProviders(raw?: string): ExtraProviderConfig[] {
  if (!raw || !raw.trim()) {
    return []
  }
  try {
    const parsed = JSON.parse(raw.trim())
    if (!Array.isArray(parsed)) {
      return []
    }
    return parsed
      .filter((p): p is ExtraProviderConfig => {
        if (!p || typeof p !== "object") return false
        const id = p.id
        const model = p.model
        const baseURL = p.baseURL
        return (
          typeof id === "string" &&
          id.length > 0 &&
          typeof model === "string" &&
          model.length > 0 &&
          typeof baseURL === "string" &&
          baseURL.startsWith("http")
        )
      })
      .map((p) => ({
        id: p.id.trim(),
        model: p.model.trim(),
        baseURL: p.baseURL.trim().replace(/\/+$/, ""),
        apiKey: typeof p.apiKey === "string" ? p.apiKey : undefined,
        headers:
          p.headers && typeof p.headers === "object"
            ? (p.headers as Record<string, string>)
            : undefined,
      }))
  } catch {
    return []
  }
}

/** True when the global provider is the deterministic mock/fail model. */
function isMockMode(): boolean {
  const provider = process.env.AI_PROVIDER || "groq"
  return provider === "mock" || provider === "mock-fail"
}

/** Build the base (non-mock) registry. */
function buildRegistry(): Record<string, ModelProvider> {
  const registry: Record<string, ModelProvider> = {}

  const groqApiKey = process.env.GROQ_API_KEY
  const groqModel = process.env.AI_MODEL || DEFAULT_AI_MODEL
  registry.groq = {
    id: "groq",
    label: "Groq",
    modelId: groqModel,
    resolve: () => {
      if (!groqApiKey) {
        throw new AiUnavailableError(
          "GROQ_API_KEY is not configured — AI features are disabled"
        )
      }
      return import("@ai-sdk/groq").then(({ createGroq }) =>
        createGroq({ apiKey: groqApiKey ?? "" })(groqModel as any)
      )
    },
  }

  const deepseekApiKey = process.env.DEEPSEEK_API_KEY
  const deepseekModel = process.env.DEEPSEEK_MODEL || "deepseek-v4-flash"
  registry.deepseek = {
    id: "deepseek",
    label: "DeepSeek",
    modelId: deepseekModel,
    resolve: () => {
      if (!deepseekApiKey) {
        throw new AiUnavailableError(
          "DEEPSEEK_API_KEY is not configured — AI features are disabled"
        )
      }
      return import("@ai-sdk/deepseek").then(({ createDeepSeek }) =>
        createDeepSeek({ apiKey: deepseekApiKey ?? "" })(deepseekModel as any)
      )
    },
  }

  for (const extra of parseExtraProviders(process.env.AI_ROUTER_EXTRA_PROVIDERS)) {
    if (registry[extra.id]) {
      continue
    }
    registry[extra.id] = {
      id: extra.id,
      label: extra.id,
      modelId: extra.model,
      resolve: async () => {
        const { createOpenAICompatible } = await import(
          "@ai-sdk/openai-compatible"
        )
        return createOpenAICompatible({
          name: extra.id,
          baseURL: extra.baseURL,
          apiKey: extra.apiKey,
          headers: extra.headers,
        })(extra.model)
      },
    }
  }

  return registry
}

export const DEFAULT_ROUTER_PROVIDERS = "groq"

/**
 * The enabled provider ids from AI_ROUTER_PROVIDERS (comma-separated, default
 * "groq"). Unknown ids are skipped so a typo degrades gracefully.
 */
export function getEnabledProviderIds(): string[] {
  const registry = getProviderRegistry()
  const raw = process.env.AI_ROUTER_PROVIDERS || DEFAULT_ROUTER_PROVIDERS
  const ids = raw
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
  const unique = [...new Set(ids)]
  const known = unique.filter((id) => registry[id])
  return known.length ? known : ["groq"]
}

export function getEnabledProviders(): ModelProvider[] {
  const registry = getProviderRegistry()
  return getEnabledProviderIds().map((id) => registry[id])
}

/**
 * The full registry. Under AI_PROVIDER=mock|mock-fail every provider's
 * `resolve()` returns the deterministic mock/fail model — the provider id and
 * configured model id are still reported so the router logic is exercised.
 */
export function getProviderRegistry(): Record<string, ModelProvider> {
  const registry = buildRegistry()
  if (isMockMode()) {
    for (const p of Object.values(registry)) {
      p.resolve = () => getModel()
    }
  }
  return registry
}

export function getProvider(id: string): ModelProvider {
  const registry = getProviderRegistry()
  const provider = registry[id]
  if (!provider) {
    throw new AiUnavailableError(`Unknown router provider "${id}"`)
  }
  return provider
}

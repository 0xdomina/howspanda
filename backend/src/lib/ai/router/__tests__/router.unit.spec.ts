import { getRoutedModel, runRoutedChat } from "../router"
import { registerMockOutput } from "../../model"

// The router tests run against the deterministic mock provider — every enabled
// provider resolves to the same offline model, so rotation/failover behavior is
// observable without any network or API key.

process.env.AI_PROVIDER = "mock"
process.env.AI_ROUTER_PROVIDERS = "groq,deepseek"
process.env.AI_ROUTER_STRATEGY = "round-robin"

// registerMockOutput is normally called by lib/ai/router/chat.ts (imported via
// the route); register it here so the mock returns a non-empty canned reply
// even when this spec runs standalone.
registerMockOutput(
  "chat",
  "Here’s a helpful answer based on How’s U shopping guidance."
)

describe("model router (deterministic mock)", () => {
  beforeEach(() => {
    process.env.AI_PROVIDER = "mock"
    process.env.AI_ROUTER_STRATEGY = "round-robin"
  })

  it("rotates the answering provider across messages in a thread", async () => {
    const key = "thread-round-robin"

    const first = await runRoutedChat({
      key,
      messages: [
        { role: "system", content: "[capability:chat] assistant" },
        { role: "user", content: "first" },
      ],
    })

    const second = await runRoutedChat({
      key,
      messages: [
        { role: "system", content: "[capability:chat] assistant" },
        { role: "user", content: "first" },
        { role: "assistant", content: first.text },
        { role: "user", content: "second" },
      ],
    })

    // round-robin across groq+deepseek: consecutive messages use different providers
    expect(first.provider).not.toEqual(second.provider)
    expect(["groq", "deepseek"]).toContain(first.provider)
    expect(["groq", "deepseek"]).toContain(second.provider)

    // deterministic mock: the canned reply is identical across providers
    expect(first.text).toBe(second.text)
    expect(first.text.length).toBeGreaterThan(0)
  })

  it("replays the full history to whichever provider answers", async () => {
    await runRoutedChat({
      key: "thread-full-history",
      messages: [
        { role: "system", content: "[capability:chat] assistant" },
        { role: "user", content: "turn one" },
        { role: "assistant", content: "reply one" },
        { role: "user", content: "turn two" },
      ],
    })

    // the mock captures the exact prompt it received
    const prompt = (globalThis as any).__howsuLastAiPrompt as string
    expect(prompt).toContain("[capability:chat]")
    expect(prompt).toContain("turn one")
    expect(prompt).toContain("reply one")
    expect(prompt).toContain("turn two")
  })

  it("prefers the last-successful provider under the failover strategy", async () => {
    process.env.AI_ROUTER_STRATEGY = "failover"
    const key = "thread-failover"

    const first = await runRoutedChat({
      key,
      messages: [{ role: "user", content: "hi" }],
    })
    const second = await runRoutedChat({
      key,
      messages: [{ role: "user", content: "again" }],
    })

    // failover sticks to the provider that last answered this thread
    expect(second.provider).toBe(first.provider)
  })

  it("respects a provider filter (internal/test use)", async () => {
    const res = await runRoutedChat({
      key: "thread-filter",
      providerFilter: ["deepseek"],
      messages: [{ role: "user", content: "hello" }],
    })

    expect(res.provider).toBe("deepseek")
  })

  it("rotates getRoutedModel across calls and reports provider metadata", () => {
    const key = "model-rotation"
    const a = getRoutedModel({ key })
    const b = getRoutedModel({ key })

    expect(a.provider).not.toEqual(b.provider)
    expect(a.model).toBeDefined()
    expect(a.modelId).toBeDefined()
  })
})

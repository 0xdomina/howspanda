# How's U AI production review — 2026-08-17

## Decision

Keep the current server-owned AI capability harness and provider router. Do
not give buyer or seller AI direct tools that mutate orders, money, inventory,
payouts, or account permissions. Read-only capabilities may return grounded
answers; state-changing ideas remain proposals that the user must approve in a
normal commerce flow.

The router now defaults to sticky failover. A conversation stays with its last
successful provider until that provider fails, then fails over for that turn.
This keeps the conversation style and context more consistent than rotating
providers on every message. Provider and model identifiers are retained for
internal usage accounting, not returned to the buyer UI.

The AI SDK is current and ESM-only, while Medusa's application runtime is
CommonJS. `src/lib/ai/sdk.ts` is the single dynamic-import boundary. This is a
runtime compatibility boundary, not a fallback implementation: production
requests use the configured provider SDK, while deterministic mock behavior is
limited to the test provider modes.

## DeepSeek

DeepSeek's official API documentation describes OpenAI-compatible access and
lists `deepseek-v4-flash` and `deepseek-v4-pro`; it also states that the older
`deepseek-chat` and `deepseek-reasoner` aliases are deprecated after July 24,
2026. The default in this project is therefore `deepseek-v4-flash`, with the
model remaining configurable through `DEEPSEEK_MODEL`.

## Qoder / Better Harness

QoderAI's `better-harness` repository is useful for evaluating coding-agent
work loops: it collects task/session evidence and produces prioritized,
verifiable engineering findings. It is not a production inference runtime or
an application-user agent framework, so it is not added to the How's U runtime
dependency graph.

## Reliability and safety controls

- Provider credentials remain backend-only.
- Buyer chat is rate-limited and has a bounded history, output cap, and request
  timeout.
- Conversation ownership is scoped to the authenticated actor or a high-
  entropy guest key.
- The system prompt is rebuilt by the server and is not trusted from history.
- AI failure returns a calm 503 while commerce remains available.
- Structured capability results are validated before usage is recorded.
- Text output is filtered for capability smuggling and contact-data leakage.

## Sources

- DeepSeek API documentation: https://api-docs.deepseek.com/guides/reasoning_model_api_example_non_streaming
- DeepSeek-V3 official repository: https://github.com/deepseek-ai/DeepSeek-V3
- DeepSeek-R1 official repository: https://github.com/deepseek-ai/DeepSeek-R1
- Vercel AI SDK official repository: https://github.com/vercel/ai
- QoderAI Better Harness: https://github.com/QoderAI/better-harness

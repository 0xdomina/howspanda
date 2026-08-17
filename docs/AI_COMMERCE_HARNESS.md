# How's U commerce AI harness

How's U does not need a coding agent in the buyer or seller experience. The
useful pattern from tools such as OpenCode and Cline is provider abstraction:
one product-owned interface can select a model, route around a failed provider,
and keep credentials out of the client. How's U applies that idea to commerce
capabilities, not shell access or software development.

## User-facing promise

Users see “How's U AI”. They do not see provider names, model IDs, prompts,
debug traces, or claims about which vendor answered. The platform chooses a
capable model behind the scenes and returns a useful result or a calm retry
message.

## Request path

```text
user request
  → capability + actor policy
  → permission-scoped commerce readers
  → model class (fast / structured / reasoning)
  → provider pool with timeout, quota, and failover
  → schema validation + safety filter
  → explanation or approval proposal
```

The current backend already has the important foundations: buyer/seller
capability registry, allowlisted readers, structured Zod contracts, quotas,
PII/jailbreak filtering, provider failover for buyer chat, and proposal-only
cart changes. Keep these boundaries as the system grows.

## Recommended capability map

| Surface | Model class | Allowed effect |
|---|---|---|
| Buyer search, product comparison, review summary | fast | answer from live catalog data |
| Buyer cart assistant | fast/structured | propose cart changes; buyer approves |
| Seller listing writer | structured | draft title, description, tags, SEO |
| Seller content/marketing | fast | draft captions, campaigns, bundles |
| Seller pricing and accounting | deterministic math + explanation | never let AI calculate or mutate money |
| Seller business insights | structured | read only that seller's products/orders |
| Complex planning | reasoning, sparingly | draft a plan; never execute money/order actions |

No buyer or seller capability gets shell, filesystem, arbitrary HTTP, payment,
inventory, payout, or order mutation tools. Mutations are explicit server
actions with ownership checks, idempotency, and user confirmation.

## Provider routing

Keep `AI_ROUTER_PROVIDERS`, `AI_ROUTER_STRATEGY`, and
`AI_ROUTER_EXTRA_PROVIDERS` backend-only. Configure pools by capability rather
than by user choice. A sensible beta setup is one reliable fast provider with a
second OpenAI-compatible fallback; optional free models are capacity bonuses,
not availability guarantees.

Each call should have:

- a short timeout and bounded output tokens;
- quota checked before the provider call;
- provider health/failure tracking and failover;
- schema validation after generation;
- no provider/model metadata in the public response;
- a stored, privacy-safe usage record for operations.

The remaining implementation gap is seller structured capabilities: some seller
routes still use the direct single-provider model helper while buyer chat uses
the router. Move those seller routes onto the same routed abstraction before
launching multiple providers, with per-capability model policies and identical
contracts. This is a controlled refactor, not a reason to add coding-agent
tools to the product.

## Journey design

Every account starts as a buyer. Completing profile details unlocks seller
setup; the user then creates a store in the same session and lands in Manage
Business. Uploading and verifying an ID unlocks courier access on that same
account. A user can be a buyer, store owner, and courier without extra email
identities. Staff access remains store-scoped and permission-limited.

The visible path stays simple:

```text
Shop → Profile → complete details → Manage Business → publish store
                         └→ upload ID → Courier access
```

Advanced controls remain behind Manage Business. Empty states should always
offer the next one-click action, and AI should help with the current task
without becoming a separate technical product.

## References

- [OpenCode providers](https://opencode.ai/v2/docs/providers)
- [OpenCode models](https://opencode.ai/v2/docs/models)
- [Cline model providers](https://docs.cline.bot/sdk/model-providers)
- [Medusa separate admin build](https://docs.medusajs.com/resources/medusa-cli/commands/build)

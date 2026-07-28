# Design: How's u — AI-Powered Multi-Vendor Marketplace

**Date:** 2026-07-28
**Status:** Approved by owner
**Platform name:** How's u

## Purpose

**How's u** is a multi-vendor commerce marketplace (Jumia/Amazon model) that infuses AI into commerce to help people shop more and sell more. The AI focus at launch is the **seller side**: helping informal businesses list, price, market, and understand their business — with a near-zero barrier to entry (sellers never need API keys or third-party accounts).

Backend logic and flows come first; the frontend UI/UX will be redesigned by the owner after the backend is finalized.

## Top-Level Structure

Two fully separate projects in the workspace root:

```
How's you/
├── backend/     Medusa v2 server — all commerce logic, marketplace layer, AI module
└── frontend/    Next.js storefront (official Medusa starter as scaffolding; custom design later)
```

- Each folder has its own `package.json`, dependencies, and scripts.
- They communicate only over HTTP (Medusa store/admin REST APIs).
- The frontend is disposable scaffolding: the backend must never depend on it.

## Technology Decisions

| Concern | Decision | Rationale |
|---|---|---|
| Commerce engine | **Medusa v2** (Node.js/TypeScript) | Only major open-source engine with an officially documented marketplace pattern; modular architecture lets AI live as a first-class module; largest community |
| Frontend | **Next.js** (official Medusa storefront starter) | Working shop UI on day one; owner replaces design later |
| Database | **PostgreSQL** (Docker locally) | Medusa requirement |
| Cache/queue | **Redis** (Docker locally, optional at first) | Medusa workflows/caching |
| AI abstraction | **Vercel AI SDK** (not LangChain) | Modern TS-native tool-calling/agents/structured output; provider-agnostic |
| AI provider | **Groq free tier** at launch | Zero cost; swappable to Gemini/OpenAI via config only |
| Payments | **Paystack**, NGN default | Africa-first market (cards, bank transfer, mobile money); test mode until live keys exist |
| Secrets | `.env` files only, never committed | Standard practice |

## Backend Core (from Medusa, no custom work)

Products & variants, carts, checkout, orders, payments, promotions/discounts, customers, inventory, fulfillment/shipping, tax, admin dashboard, REST APIs. These battle-tested flows are the "existing commerce store logic" foundation.

## Marketplace Module (custom, follows Medusa's official marketplace recipe)

- **Seller** entity: business name, brand info, verification status, linked to user accounts.
- **Product ownership**: every product is linked to exactly one seller.
- **Order splitting**: a buyer's cart spanning N sellers produces 1 parent order + N child seller-orders, each fulfilled independently (Jumia model).
- **Commission engine**: platform takes a configurable % per seller-order; a ledger records what the platform owes each seller.
- **Payouts**: phase 2, via Paystack Transfers to sellers' bank accounts.

## AI Module ("one brain, many memories")

Platform-owned AI; sellers never see or supply API keys.

- **Provider abstraction** via Vercel AI SDK; model/provider is a config change, not a code change.
- **Per-seller agent context**: every AI call is scoped strictly to one seller's own data (their products, orders, customers). Hard isolation — Seller A's agent can never read Seller B's data.
- **Launch capabilities** (all seller-facing):
  1. **Listing writer** — generate product titles/descriptions from rough input or photos.
  2. **Pricing advisor** — suggest prices from category and marketplace data.
  3. **Business insights** — plain-language CRM/sales answers ("what sold best this month?"), customer patterns, restock suggestions.
  4. **Accounting summary** — revenue, commission deducted, simple profit view, monthly digests.
  5. **Marketing coach** — brand voice, promo ideas, product bundling suggestions.
- **Quota system**: every AI action is recorded per seller; free tier = N actions/month (configurable). The data model supports paid tiers from day one (future monetization).

## Payments Flow (Africa-first)

Buyer pays via Paystack into the platform account → commission math recorded in the platform ledger → seller payouts later via Paystack Transfers. Development uses Paystack test mode / Medusa's manual provider until live keys exist.

## Error Handling

- Medusa workflows provide compensation/rollback (e.g., payment failure cancels the order cleanly).
- **AI failures never block commerce**: if the AI provider is down or quota is exhausted, buying/selling continues; AI features degrade gracefully with a "try again later" state.
- Quota exhaustion returns a clear, seller-friendly message, not an error.

## Testing

- Integration tests for the marketplace module: order splitting across sellers, commission calculation, ledger correctness.
- Integration tests for the AI module: quota enforcement, per-seller context isolation, provider-failure fallbacks.
- Standard Medusa test tooling (Jest-based integration tests against a test database).

## Build Phases

1. **Phase 1 — Scaffolding**: `backend/` (Medusa v2) and `frontend/` (Next.js starter) both running locally against Dockerized Postgres/Redis.
2. **Phase 2 — Marketplace module**: sellers, product ownership, order splitting, commission ledger.
3. **Phase 3 — AI module**: provider abstraction, per-seller agents, the 5 launch capabilities, quota system.
4. **Phase 4 — Paystack integration** (test mode).
5. **Phase 5+ (later)**: seller vendor dashboard UI, live payouts, owner's custom storefront design, buyer-side AI (shopping assistant, semantic search).

## Out of Scope (for now)

- Buyer-side AI (shopping assistant, smart search) — future phase.
- Seller "bring your own key" — rejected; platform-owned AI only.
- Live payment processing and payouts — test mode until business accounts exist.
- Mobile apps.

## Success Criteria

- A buyer can browse, cart, and check out products from multiple sellers; the order splits correctly and commissions are recorded accurately.
- A seller's AI agent can generate a listing, suggest a price, and answer a business question using only that seller's data.
- Switching the AI provider (Groq → Gemini) requires only environment/config changes.
- Backend runs and passes tests with the `frontend/` folder deleted.

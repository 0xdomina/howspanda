# How's u

AI-powered multi-vendor marketplace — shop more, sell more.

## Structure

- `backend/` — Medusa v2 server: all commerce logic, marketplace layer, AI module. Fully independent.
- `frontend/` — Next.js storefront (scaffolding; custom design coming later). Talks to the backend over HTTP only.
- `docs/` — specs and implementation plans.

## Run locally

1. Infrastructure: `cd backend; docker compose up -d`
2. Backend: `cd backend; npm run dev` → API http://localhost:9000, admin http://localhost:9000/app
3. Storefront: `cd frontend; npm run dev` → http://localhost:8000

Environment files: copy `backend/.env.template` → `backend/.env`; create `frontend/.env.local` with your publishable API key (Admin → Settings → Publishable API Keys). Never commit `.env*` files with real secrets.

## Marketplace API (Phase 2)

Sellers are a custom `seller` actor type. Flow:

1. `POST /auth/seller/emailpass/register` → registration JWT
2. `POST /sellers` (Bearer registration JWT) → create seller + admin
3. `POST /auth/seller/emailpass` → authenticated JWT
4. `GET /sellers/me` · `POST|GET /sellers/products` · `GET /sellers/orders` · `GET /sellers/commissions`

Checkout uses `POST /store/carts/:id/complete-marketplace`: carts spanning N sellers
produce 1 parent order + N child seller orders, and a pending commission line
(default 10%, per-seller `commission_rate`) is recorded for each seller order.

> Known gap (deferred to the fulfillment phase): child seller orders are created
> without their own inventory reservations, so fulfilling items with
> `manage_inventory: true` from a child order will fail until reservations are
> transferred from the parent order.

## AI Module (Phase 3) — "one brain, many memories"

Platform-owned AI for sellers (no seller API keys, ever). Provider is a
config switch: `AI_PROVIDER=groq|mock|mock-fail`, `AI_MODEL`, `GROQ_API_KEY`
in `backend/.env` (Vercel AI SDK abstraction — swapping providers is an env
change, not a code change).

Seller endpoints (Bearer seller JWT):

| Endpoint | Capability |
|---|---|
| `POST /sellers/ai/listing` | Listing writer — title/description/tags/SEO from rough notes |
| `POST /sellers/ai/pricing` | Pricing advisor — grounded in anonymized marketplace price stats |
| `POST /sellers/ai/insights` | Business insights — answers from the seller's own products/orders only |
| `POST /sellers/ai/accounting` | Accounting digest — commission ledger math done in code, explained by AI |
| `POST /sellers/ai/marketing` | Marketing coach — brand voice, promos, bundles from the seller's catalog |
| `GET /sellers/ai/quota` | Current month usage/limit/remaining |

Rules: every call is quota-checked first (free tier
`AI_FREE_TIER_MONTHLY_LIMIT`/month, per-seller overrides via `ai_quota`);
quota exhaustion → friendly 429; provider failure → friendly 503 and the
action is never billed. AI failures never block commerce. Every AI call's
context is hard-scoped to the authenticated seller's own data.

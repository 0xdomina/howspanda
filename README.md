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

## Payments (Phase 4)

Africa-first, multi-rail payments: two fiat gateways (Paystack, Flutterwave) plus a
network-agnostic crypto USDC rail. Buyers see every enabled rail ranked by fee with
the cheapest **fiat** rail pre-selected; crypto is always offered but never the silent
default. Adding a provider later (e.g. Monnify) is a config + small module change.

### Providers

| Provider id | Rail | Live behavior | Mock mode when |
|---|---|---|---|
| `pp_paystack_paystack` | Fiat (NGN, kobo) | Hosted checkout URL, HMAC-SHA512 webhook, refunds | secret absent/`mock` |
| `pp_flutterwave_flutterwave` | Fiat (NGN) | Hosted payment link, verif-hash webhook, refunds | secret absent/`mock` |
| `pp_crypto-usdc_crypto-usdc` | Crypto USDC | Circle developer-controlled wallets, poll-based settlement | `CIRCLE_API_KEY` absent/`mock` |
| `pp_system_default` | Manual | Medusa built-in; excluded from fee routing | - |

Every provider runs in deterministic **mock mode** offline when its secret is missing
or set to the literal `mock`, so the app boots and tests run with no keys and no network.
Providers are attached to the Nigeria region in `src/scripts/seed.ts`.

### Fee routing

`GET /store/payment-options?amount=<minor>&currency=ngn` returns the enabled rails
ranked cheapest-first with a single `recommended` flag on the cheapest *fiat* rail.
Fees (minor units): Paystack 1.5% + NGN 100 flat (waived under NGN 2,500, capped NGN
2,000); Flutterwave 1.4% (capped NGN 2,000); crypto 0 (gas abstracted). It is a
read-only quote and never mutates carts or sessions. Checkout itself stays
`POST /store/carts/:id/complete-marketplace`. Logic lives in `src/lib/payments/fees.ts`.

### Crypto USDC - network-agnostic, no seed phrase

USDC on Circle developer-controlled wallets: Circle custodies keys behind an API key +
entity secret, so **users never handle a seed phrase**. Networks `base` and `solana`
today (extensible to `bsc`, `somnia`, `arc`); testnet<->mainnet is a pure env switch.
NGN->USDC uses a fixed configurable rate (`CRYPTO_NGN_PER_USDC`, a placeholder for a
real oracle later). An unknown network throws instead of silently picking a wrong
chain. Settlement seam: `src/lib/payments/crypto/` (mock + Circle adapters).

### Configuration (`backend/.env`)

| Var | Purpose |
|---|---|
| `PAYSTACK_SECRET_KEY` / `PAYSTACK_PUBLIC_KEY` | Paystack keys; `mock`/blank = mock mode |
| `FLUTTERWAVE_SECRET_KEY` / `FLUTTERWAVE_PUBLIC_KEY` | Flutterwave keys; `mock`/blank = mock mode |
| `CRYPTO_ENABLED` | `true` to offer the crypto rail |
| `CRYPTO_DEFAULT_NETWORK` | `base` (default) or `solana` |
| `CRYPTO_NETWORK_ENV` | `testnet` (default) or `mainnet` |
| `CRYPTO_NGN_PER_USDC` | Fixed NGN-per-USDC quote rate (default 1600) |
| `CIRCLE_API_KEY` | Circle key; `mock`/blank = mock settlement |
| `CIRCLE_ENTITY_SECRET` / `CIRCLE_WALLET_SET_ID` | Circle developer-controlled-wallet config (live) |

### Testing

`integration-tests/http/payments.spec.ts` covers deterministic offline units (fee
routing, each provider mock state machine, network-agnostic settlement) plus an in-app
boot check that the three providers register enabled and `/health` stays 200. Run with
a running Postgres and DB creds from `.env`:

```
DB_HOST=localhost DB_PORT=5432 DB_USERNAME=... DB_PASSWORD=... \
  npx jest integration-tests/http/payments.spec.ts --runInBand --forceExit
```

> Known gaps (deferred to the payouts phase): on-chain crypto refunds are not yet
> executed (the amount is echoed for ledger consistency); the NGN->USDC rate is a
> fixed placeholder, not a live oracle; `PAYMENT_DEFAULT_CURRENCY` in `.env.template`
> is documentation-only. **Live crypto is not production-ready**: settlement
> matches any inbound transfer to a shared receiving wallet and is not correlated
> per checkout, so per-intent deposit addresses (or amount+reference matching)
> must be added before enabling it.

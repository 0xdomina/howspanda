# Phase 4 — Payments (fiat multi-provider + crypto testnet PoC)

## Summary

Give "How's u" real checkout money-movement, Nigeria-first, behind a
provider-agnostic seam:

- **Fiat**: Paystack + Flutterwave as Medusa v2 payment providers, both
  usable in **test mode today** (no KYC to build/demo). A fee-routing helper
  picks the cheapest provider per cart; the buyer can override to any enabled
  provider. New NGN currency + Nigeria region wired to all providers.
- **Crypto (testnet PoC)**: a **network-agnostic `CryptoSettlement`** adapter
  with a `testnet | mainnet` switch, implemented for **Base Sepolia + Solana
  Devnet** via **Circle developer-controlled wallets** (no user seed phrase,
  USDC-native). Exposed as a selectable `crypto-usdc` payment provider.

Every provider has a deterministic **mock mode** (like the AI module) so tests
and local dev run offline with zero external keys.

Non-goals for Phase 4: real KYC/live keys, Arc (testnet-only upstream, mainnet
~Q2 2026), BSC/Somnia rails, mainnet crypto, payout/withdrawal to sellers.

## Guiding constraints (carried from the project)

- STRICT two-folder separation: all work is in `backend/`. No frontend.
- Medusa module isolation: payment providers are their own modules; cross-module
  reads go through `query.graph`.
- Windows apostrophe-path rules: `db:*` via the `howsu-link` junction with
  `--preserve-symlinks`; integration tests via `subst X:` + `realpath-alias.js`
  preload (see the Phase 3 test invocation, reuse verbatim).
- PowerShell 5.1: `;` not `&&`; dev-server log OUTSIDE `backend/`.
- Money math is deterministic and lives in code; providers never invent totals.

## Provider contract (verified against node_modules)

`AbstractPaymentProvider<TConfig>` from `@medusajs/utils` — abstract methods:
`initiatePayment`, `authorizePayment`, `capturePayment`, `cancelPayment`,
`deletePayment`, `getPaymentStatus`, `refundPayment`, `retrievePayment`,
`updatePayment`, `getWebhookActionAndData`; static `identifier` + optional
`validateOptions`. Registered id becomes `pp_{identifier}_{id}`.

`getWebhookActionAndData(payload)` returns `{ action, data: { session_id, amount } }`
where `action` ∈ `PaymentActions` (`authorized`, `captured`, `failed`,
`pending`, `pending_authorization`, ...). Redirect gateways (Paystack/
Flutterwave) authorize asynchronously → `initiatePayment` returns a hosted
`authorization_url` in its `data`; the webhook flips the session to
`authorized`/`captured`.

**Implementer MUST confirm before coding** (read node_modules, do not guess):
1. Exact `ModuleProvider(Modules.PAYMENT, { services: [...] })` registration in
   `@medusajs/utils` and the payment-module `providers` option shape in
   `medusa-config`.
2. Field names on `InitiatePaymentInput/Output`, `AuthorizePaymentInput/Output`,
   `CapturePaymentInput/Output`, `RefundPaymentInput/Output`,
   `GetWebhookActionAndDataInput`, `WebhookActionResult` in
   `@medusajs/types/dist/payment/provider.d.ts`.
3. The core webhook route path for providers (`/hooks/payment/{provider_id}`)
   from the installed `@medusajs/medusa` dist api.

---

## Task 1 — NGN region, seed, env, module registration

**Files**: `backend/.env.template`, `backend/medusa-config.ts`,
`backend/src/scripts/seed.ts`.

- `.env.template` — append a Payments block:
  ```
  # Payments — fiat (Nigeria-first; test keys work immediately, no KYC to build)
  # Set a key to the literal "mock" (or leave blank) for deterministic offline mode.
  PAYSTACK_SECRET_KEY=mock
  PAYSTACK_PUBLIC_KEY=
  FLUTTERWAVE_SECRET_KEY=mock
  FLUTTERWAVE_PUBLIC_KEY=
  PAYMENT_DEFAULT_CURRENCY=ngn

  # Payments — crypto (testnet PoC via Circle developer-controlled wallets)
  CRYPTO_ENABLED=true
  CRYPTO_NETWORK_ENV=testnet          # testnet | mainnet
  CRYPTO_DEFAULT_NETWORK=base         # base | solana
  CIRCLE_API_KEY=mock
  CIRCLE_ENTITY_SECRET=
  CIRCLE_WALLET_SET_ID=
  ```
- `medusa-config.ts` — add ONE modules entry resolving `@medusajs/medusa/payment`
  with a `providers` array of three entries (paystack, flutterwave, crypto-usdc),
  each `{ resolve: "./src/modules/payment-providers/<name>", id: "<name>",
  options: { ...env } }`. Keep marketplace/ai/redis entries unchanged.
- `seed.ts`:
  - Add `ngn` to store `supported_currencies` (keep eur default, usd; add ngn).
  - Add a **Nigeria region** `{ name: "Nigeria", currency_code: "ngn",
    countries: ["ng"], payment_providers: [<the three pp_ ids>] }`. Also add
    `pp_system_default` to keep local dev checkout working.
  - Add a tax region for `ng` (`tp_system`).
  - The provider ids are `pp_paystack_paystack`, `pp_flutterwave_flutterwave`,
    `pp_crypto-usdc_crypto-usdc` — confirm exact strings from the id convention
    after the providers are registered (log them once, then hardcode in seed).

**Done when**: `npm run dev` boots clean, `medusa exec ./src/scripts/seed.ts`
creates the Nigeria region with all providers, tsc clean.

---

## Task 2 — Paystack + Flutterwave payment providers

**Files**:
`backend/src/modules/payment-providers/paystack/{index.ts,service.ts}`,
`backend/src/modules/payment-providers/flutterwave/{index.ts,service.ts}`,
`backend/src/lib/payments/http.ts` (tiny fetch helper w/ timeout + JSON).

Each `service.ts` extends `AbstractPaymentProvider<Options>`:

- `static identifier = "paystack"` / `"flutterwave"`.
- `initiatePayment(input)` — convert amount to provider's minor unit (kobo for
  NGN ×100), call the gateway's "initialize transaction" endpoint, return
  `{ id: <provider_ref>, data: { authorization_url, reference, provider } }`.
  **Mock mode** (secret key absent or `"mock"`): return a deterministic
  `authorization_url` like `https://mock.pay/<provider>/<reference>` and a
  synthetic reference; never hit the network.
- `authorizePayment(input)` — verify the transaction (`GET /transaction/verify`
  for Paystack; `GET /transactions/:id/verify` for Flutterwave). Return
  `{ status: "authorized" | "pending", data }`. Mock mode → `"authorized"`.
- `capturePayment` — gateways auto-capture on success; return the session data
  marked captured. `refundPayment` — call refund endpoint (mock: echo amount).
- `cancelPayment`, `deletePayment`, `getPaymentStatus`, `retrievePayment`,
  `updatePayment` — minimal correct implementations (status from stored data).
- `getWebhookActionAndData(payload)` — validate signature
  (Paystack: `x-paystack-signature` HMAC-SHA512 of raw body with secret key;
  Flutterwave: `verif-hash` header equals a configured secret hash), map
  `charge.success`/`successful` → `{ action: "captured", data: { session_id,
  amount } }`, failures → `"failed"`. Mock mode → treat body `{ session_id,
  amount, event }` directly.
- `static validateOptions(options)` — no throw in mock mode; in live mode require
  the secret key.

`index.ts` for each: `ModuleProvider(Modules.PAYMENT, { services: [ThisService] })`.

**Done when**: tsc clean; both providers register (ids visible in logs); mock
mode returns deterministic initiate/authorize without network.

---

## Task 3 — Fee routing (cheapest-provider selection)

**Files**: `backend/src/lib/payments/fees.ts`,
`backend/src/api/store/payment-options/route.ts`,
`backend/src/api/store/payment-options/README` (inline comment only).

- `fees.ts` — pure functions. A fee table keyed by provider id:
  - paystack: `1.5% + ₦100`, ₦100 waived under ₦2,500, cap ₦2,000.
  - flutterwave: `1.4%`, cap ₦2,000.
  - crypto-usdc: flat network-fee estimate (e.g. ₦0 platform + tiny gas note),
    only listed when `CRYPTO_ENABLED=true`.
  `effectiveFee(providerId, amountMinor, currency)` returns minor-unit fee;
  `rankProviders(amountMinor, currency, enabledIds)` returns providers sorted
  ascending by fee with a `recommended: true` on the cheapest.
- `GET /store/payment-options?amount=&currency=` (publishable-key auth, matches
  existing store routes) → `{ currency, amount, options: [{ provider_id, label,
  fee, total, recommended }] }`. Amounts in minor units; validate query with a
  Zod schema in `middlewares.ts` (import `z` from `@medusajs/framework/zod`).
- The storefront (future) reads this, preselects `recommended`, lets the buyer
  pick any option → drives which `payment_provider_id` the cart's payment
  session uses. No cart mutation happens in this endpoint (read-only quote).

**Done when**: endpoint returns correctly ranked options; for ₦10,000
Flutterwave (₦140) beats Paystack (₦250) and is `recommended`; tsc clean.

---

## Task 4 — Crypto settlement adapter + Circle (Base + Solana testnet)

**Files**:
`backend/src/lib/payments/crypto/adapter.ts` (interface + types),
`backend/src/lib/payments/crypto/circle.ts` (Circle impl),
`backend/src/lib/payments/crypto/mock.ts` (deterministic offline impl),
`backend/src/lib/payments/crypto/index.ts` (factory: env → impl + network),
`backend/src/modules/payment-providers/crypto-usdc/{index.ts,service.ts}`.

- `adapter.ts` — the network-agnostic seam:
  ```ts
  export type CryptoNetwork = "base" | "solana"      // extensible: bsc, somnia, arc
  export type NetworkEnv = "testnet" | "mainnet"
  export interface DepositIntent {
    network: CryptoNetwork; env: NetworkEnv
    address: string; usdc_amount: string; reference: string
    wallet_id: string; expires_at: string
  }
  export interface SettlementStatus {
    reference: string; status: "pending" | "confirmed" | "failed"
    tx_hash?: string; usdc_received?: string
  }
  export interface CryptoSettlement {
    readonly network: CryptoNetwork
    readonly env: NetworkEnv
    createDepositIntent(input: { reference: string; usdc_amount: string }): Promise<DepositIntent>
    checkSettlement(reference: string): Promise<SettlementStatus>
  }
  ```
- `circle.ts` — implement `CryptoSettlement` with `@circle-fin/adapter-circle-wallets`
  (developer-controlled wallets, one wallet set): create/reuse a receiving wallet
  on the selected blockchain (`BASE-SEPOLIA` / `SOL-DEVNET` in testnet), return
  the address as the deposit target, poll balances/transfers in `checkSettlement`.
  Keys/entity-secret from options. NGN→USDC quote uses a fixed configurable rate
  for the PoC (`CRYPTO_NGN_PER_USDC`, default a sane constant) — deterministic,
  documented as a placeholder for a real oracle later.
- `mock.ts` — deterministic: address `mock-<network>-<reference>`, immediate
  `confirmed` on second `checkSettlement` call (first `pending`), no network.
- `index.ts` — `getCryptoSettlement(network?)`: reads `CRYPTO_NETWORK_ENV`,
  `CRYPTO_DEFAULT_NETWORK`, and Circle creds; returns `mock.ts` when `CIRCLE_API_KEY`
  is absent/`"mock"`, else `circle.ts`. Throws on unknown network (mirrors the AI
  `getModel` unknown-provider guard).
- `crypto-usdc/service.ts` — `AbstractPaymentProvider`, `identifier = "crypto-usdc"`.
  `initiatePayment` → quote NGN→USDC, `createDepositIntent`, return
  `{ id: reference, data: { network, env, address, usdc_amount, expires_at } }`.
  `authorizePayment` → `checkSettlement`; `confirmed` → `authorized`, else
  `pending_authorization` (Medusa creates an awaiting order, re-checked later).
  `getPaymentStatus` mirrors it. `capturePayment` marks captured on confirm.
  `getWebhookActionAndData` → not used in PoC (return `not_supported`); settlement
  is polled via `authorizePayment`.

**Done when**: with `CIRCLE_API_KEY=mock`, initiate returns a Base/Solana deposit
intent and authorize goes pending→authorized deterministically; factory switches
network by env; tsc clean. (Real Circle testnet call is exercised in Task 5 only
if creds are present.)

---

## Task 5 — Live proof

Reuse the Phase 3 live-proof style (curl/Invoke-RestMethod against the running
dev server; capture exact JSON). Prove, in mock mode (no external keys):

1. **Fee routing**: `GET /store/payment-options?amount=1000000&currency=ngn`
   ranks Flutterwave cheapest and `recommended:true`.
2. **Paystack checkout**: create cart in Nigeria region → set payment session to
   `pp_paystack_paystack` → complete via existing `complete-marketplace` →
   order created, commission line written (marketplace split still works).
3. **Flutterwave**: same flow with `pp_flutterwave_flutterwave`.
4. **Crypto**: initiate `pp_crypto-usdc_crypto-usdc` → response carries a
   Base-Sepolia deposit address + USDC amount; authorize twice →
   pending→authorized; order reaches paid/awaiting correctly.
5. **Isolation/no-regression**: AI routes and existing store/seller routes still
   200; existing Phase 1-3 integration suite unaffected.

Record raw responses in the completion summary. No commit for this task.

---

## Task 6 — Integration tests

**File**: `backend/integration-tests/http/payments.spec.ts` (follow
`ai.spec.ts`/`marketplace.spec.ts` runner + the subst-X: invocation verbatim).
Set `PAYSTACK_SECRET_KEY=mock`, `FLUTTERWAVE_SECRET_KEY=mock`,
`CIRCLE_API_KEY=mock`, `CRYPTO_ENABLED=true` at module top.

Cases:
- `GET /store/payment-options` ranks providers correctly (Flutterwave < Paystack
  at ₦10k; crypto listed only when enabled).
- Cart in Nigeria region can initiate a Paystack session and complete → order +
  commission line exist.
- Flutterwave path completes likewise.
- Crypto initiate returns a deposit intent; authorize transitions
  pending→authorized (mock).
- Unknown/disabled provider is rejected; a failed webhook/verify maps to a
  non-authorized status (never silently authorizes).
- No-regression: `/health` 200 and one existing marketplace assertion still pass.

**Done when**: full suite green (existing 15 + new), reported verbatim.

---

## Task 7 — README docs

Append a **## Payments (Phase 4)** section after the AI Module section:
- Provider table (Paystack, Flutterwave, crypto-usdc) with env vars + mock mode.
- Fee-routing endpoint contract + example ranking.
- Nigeria region / NGN note; test-mode vs live-KYC reality.
- Crypto PoC: Circle developer-controlled wallets, Base Sepolia + Solana Devnet,
  `CRYPTO_NETWORK_ENV` switch, "no seed phrase", and the explicit note that
  Base/BSC/Solana are mainnet-ready while Arc/Somnia + real settlement are a
  later phase.

---

## Test Plan (aggregate)

- `npx tsc --noEmit` clean after every task (run from the junction).
- `npm run dev` boots; seed creates Nigeria region + providers.
- Live proofs 1-5 captured verbatim in mock mode.
- Full integration suite green (existing + `payments.spec.ts`), reported verbatim.
- Working tree committed per task; plan committed first.

## Assumptions

- Mock mode is the default for all providers so CI/dev needs no secrets; live
  keys are a pure env swap (no code change).
- Crypto is a **testnet PoC** only; BSC/Somnia/Arc, mainnet, payouts, and a real
  NGN↔USDC oracle are explicitly deferred to a later phase.
- `@circle-fin/adapter-circle-wallets` (+ any peer deps) is added via the
  `howsu-link` junction with `--preserve-symlinks`; if the package surface differs
  from this plan, the implementer adapts `circle.ts` to the installed API and
  keeps the `CryptoSettlement` interface stable.
- Provider ids follow `pp_{identifier}_{id}`; exact strings are logged once at
  boot and then hardcoded in the seed.

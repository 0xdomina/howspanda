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

> Fulfillment + inventory: `completeCartWorkflow` reserves stock against the
> parent order's line items, so the marketplace workflow transfers those
> reservations down to each child seller order (`transfer-inventory-reservations`
> step). Each seller can therefore fulfil their own child order — including
> `manage_inventory: true` items — without double-reserving. Handled automatically
> on checkout; no manual reservation setup needed.

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

> Known gaps (deferred to later phases): on-chain crypto refunds are not yet
> executed (the amount is echoed for ledger consistency); the NGN->USDC rate is a
> fixed placeholder, not a live oracle; `PAYMENT_DEFAULT_CURRENCY` in `.env.template`
> is documentation-only. ~~Live crypto settlement matches any inbound transfer to a
> shared receiving wallet~~ — fixed in Phase 5: every deposit intent gets its own
> Circle wallet and settlement requires an inbound transfer to that wallet matching
> the expected USDC amount.

## Payouts & Settlement (Phase 5)

Money OUT — the mirror of Phase 4's money IN. Commission lines earned at checkout
flow through a settlement ledger into seller payouts over two rails: **Paystack
Transfers** (NGN bank accounts) and **USDC withdrawals** (Circle, network-agnostic).
Both rails have deterministic offline mocks, same convention as Phase 4.

### Settlement state machine

```
checkout ─→ pending ─(clearance window)→ available ─(payout sweep)→ reserved ─→ paid
                │                          │  ▲                        │
                └─→ reversed (refund)  ────┘  └─(payout failed)────────┘

paid + refund ─→ negated ":reversal" offset line born available (clawback)
```

- ~~`pending → available` after `PAYOUT_CLEARANCE_DAYS` (default 7)~~ — this
  time-based placeholder was replaced in Phase 6 by delivery-confirmation
  escrow (see below); `pending` now means "held in escrow".
- Balance buckets per currency: `pending`, `available`, `reserved`, `paid_out`
  (`reversed` lines are excluded; clawback offsets net out of `available`).
- Reversals: `POST /admin/commissions/reverse` `{ order_id, reason }` — unpaid
  lines flip to `reversed`; already-paid lines get a negated `:reversal` offset
  line; `reserved` lines conflict until the in-flight payout is reconciled.

### Payout lifecycle & idempotency

`requested → processing → paid | failed | reversed`. Contract:

- The provider-side transfer reference is **always the payout id** — Paystack
  rejects duplicate references, so a crashed-and-replayed workflow can never
  double-pay.
- `idempotency_key` is unique per payout; replaying the same key returns the
  same payout untouched (`sched-<seller_id>-<YYYYMMDD>` for cron runs = one
  scheduled payout per seller per day).
- A payout sweeps the **full available NGN balance** (≥ `PAYOUT_MIN_NGN`,
  default 5000) into `reserved`; workflow failure compensates: zero payout rows,
  all lines released back to `available`.
- `failed` releases lines to `available`; `reversed` (money bounced after paid)
  returns paid lines to `available`.

### Rails

| Rail | Destination | Live behavior | Mock behavior (`mock`/blank key) |
|---|---|---|---|
| `paystack` | Verified NUBAN (name-resolve + transfer recipient) | `/bank/resolve`, `/transferrecipient`, `/transfer`, HMAC-SHA512 webhook, `/transfer/verify` | resolve fails for `00`-prefixed accounts; `RCP_mock_*`, `TRF_mock_*`; verify pending→success; `fail` in reference → failed |
| `crypto-usdc` | `base`/`solana` address | Circle treasury wallet → `createTransaction` with refId, poll by refId | withdrawal pending→confirmed (`0xmockout*`); `fail` in address → failed |

Crypto deposits (Phase 4 gap fix): every intent provisions its **own** Circle
wallet and `checkSettlement({ reference, wallet_id, expected_usdc })` only
confirms an inbound transfer to that wallet for at least the expected amount —
two concurrent checkouts can never cross-confirm.

### API

| Endpoint | Auth | Purpose |
|---|---|---|
| `GET /sellers/balance` | seller | Balance buckets + clearance/minimum config |
| `GET\|POST /sellers/payout-accounts` | seller | List/register destinations (bank verified by name-resolve; first of type = default) |
| `GET\|POST /sellers/payouts` | seller | Payout history / request a payout (`{ rail, idempotency_key? }`) |
| `POST /hooks/payouts/paystack` | public (HMAC in live) | `transfer.success\|failed\|reversed` → payout transitions; unknown events acked 200 |
| `GET /admin/payouts` | admin | All payouts, filter `status`, `seller_id` |
| `POST /admin/payouts/run` | admin | Run the scheduled sweep now (`{ seller_id? }`) |
| `POST /admin/payouts/:id/reconcile` | admin | Poll that payout's rail now |
| `POST /admin/commissions/reverse` | admin | Refund/chargeback ledger reversal |

### Scheduling

Three cron jobs (`src/jobs/`): `release-escrow-lines` (hourly, always on —
replaced Phase 5's `clear-commission-lines` in Phase 6),
`scheduled-payouts` (daily 02:00) and `reconcile-payouts` (every 15 min) — the
latter two are no-ops unless `PAYOUT_SCHEDULE_ENABLED=true`, so dev/test
environments never fire transfers by accident.

### Configuration (`backend/.env`)

| Var | Purpose |
|---|---|
| `PAYOUT_CLEARANCE_DAYS` | Retired in Phase 6 — replaced by the `ESCROW_*` vars below |
| `PAYOUT_MIN_NGN` | Minimum available NGN balance to pay out (default 5000) |
| `PAYOUT_SCHEDULE_ENABLED` | `true` to enable the payout + reconcile crons |

### Testing

`integration-tests/http/payouts.spec.ts`: offline units for both rail mocks +
the correlation fix, and an in-app suite covering ledger clearance/balance
buckets, the create-payout workflow (reserve/idempotent replay/below-minimum
compensation), webhook success/failure, crypto reconcile, and both reversal
paths. Full suite: 5 spec files, 46 tests.

## Escrow Release & Returns (Phase 6)

Funds from a sale stay **held in escrow** (`pending`) until the buyer actually
has the goods — release is driven by delivery and confirmation, not a timer.
Ledger statuses are unchanged; six escrow columns on the commission line
(`parent_order_id`, `delivered_at`, `confirmed_at`, `release_due_at`,
`held_at`, `hold_reason`) qualify what `pending` means.

### Escrow state machine

```
                     ┌─(buyer confirms receipt)──────────────┐
checkout ─→ pending ─┼─(delivered + return window expires)───┼─→ available ─→ Phase 5 payout flow
   (escrow)    │     └─(never delivered, 30-day fallback)────┘
               │
               ├─(return requested / admin hold)─→ held ─(cancel-return / admin release)─→ pending
               │                                    │
               └────────────────────────────────────┴─(return received by seller)─→ reversed
```

### Release triggers

| Trigger | When | Result |
|---|---|---|
| Buyer confirms receipt | `POST /store/orders/:id/confirm-receipt` | immediate release to `available` |
| Return window expires | `release_due_at` (delivery + `ESCROW_RETURN_WINDOW_DAYS`) ≤ now, not held | hourly sweep releases |
| Fallback | never marked delivered after `ESCROW_FALLBACK_RELEASE_DAYS` | hourly sweep releases |

Held lines (open return or admin dispute) **never** auto-release. A return
received by the seller reverses the line through the Phase 5 reversal flow
(incl. paid-line clawback offsets). Once escrow has released, `request-return`
answers 409 — post-release disputes go through the admin reversal flow.

### Non-returnable goods

Sellers flag products with `product.metadata.non_returnable = true` —
perishables, perfumes, cosmetics, soaps/creams per FCCPA and EU
distance-selling guidance (sealed, hygiene-sensitive or personalized goods).
An order counts as non-returnable only if **all** its items are flagged;
mixed orders stay returnable. Buyer-remorse returns are blocked with a
buyer-friendly message, but escrow still releases only on confirmed receipt —
and **defect claims are never blocked** (support/admin path).

### API

| Endpoint | Auth | Purpose |
|---|---|---|
| `POST /store/orders/:id/confirm-receipt` | publishable key + order email | Confirm receipt → immediate release |
| `POST /store/orders/:id/request-return` | publishable key + order email | Open a return inside the window → funds held |
| `POST /store/orders/:id/cancel-return` | publishable key + order email | Withdraw the return → release clock resumes |
| `POST /sellers/orders/:id/mark-delivered` | seller | Mark delivered → return window starts (idempotent) |
| `POST /sellers/orders/:id/return-received` | seller | Goods came back → commission reversed |
| `POST /admin/escrow/hold` | admin | Dispute hold `{ order_id, reason }` |
| `POST /admin/escrow/release` | admin | Lift a hold `{ order_id, release_now? }` |

Buyer identity is order id + exact email match (guest checkout) — a
placeholder until customer JWT lands with the frontend phase. Fulfillment
`delivery.created` and order return events drive the same transitions via
subscribers, so core Medusa flows trigger escrow without the explicit
endpoints.

### Configuration (`backend/.env`)

| Var | Purpose |
|---|---|
| `ESCROW_RETURN_WINDOW_DAYS` | Buyer confirmation/return window after delivery (default 3) |
| `ESCROW_FALLBACK_RELEASE_DAYS` | Safety release for never-delivered lines (default 30) |

`PAYOUT_CLEARANCE_DAYS` is retired — Phase 5's time-based clearance is fully
replaced by this delivery-confirmation trigger.

### Testing

`integration-tests/http/escrow.spec.ts`: 14 in-app tests — window start with
idempotent replays, cross-seller 404s, confirm-receipt release, sweep release
and 30-day fallback, return hold → reversal, cancel-return, non-returnable and
mixed orders, post-release 409, admin hold/release, and the escrow → payout
seam. Full suite as of Phase 6: 6 spec files, 60 tests.

## Store Identity & Redeemables (Phase 7)

Every seller gets a public front door, and a shelf of **redeemable
instruments** — gift cards, vouchers and tickets — sold or gifted from their
store and honoured digitally at checkout or physically at the counter/door.

### The front door

`GET /store/sellers/:handle` → seller profile + published products + priced
instruments currently for sale. Bearer codes are **never** exposed on public
surfaces — the storefront lists templates without their `code`, and the public
code check only answers for a code the caller already holds.

### The `redeemables` module

Third custom module (`src/modules/redeemables`): `Redeemable` (the coded
instrument) + `Redemption` (append-only audit of every draw). Codes are
unguessable — `GC-`/`VC-`/`TK-` prefix + 12 crypto-random chars from an
unambiguous alphabet (no 0/O/1/I/L), e.g. `GC-H6D5-U46E-AJR2`. The QR payload
is simply the code.

| Type | Prefix | Value model | Checkout | In-store |
|---|---|---|---|---|
| Gift card | `GC-` | `face_value` with a `balance` that draws down across uses | applies up to `min(balance, total)` | seller draws down any amount ≤ balance |
| Voucher | `VC-` | one-shot `fixed` or `percent` discount | fixed capped at total; percent rounded | fixed redeems at its value; percent logs the use (seller applies it on their own till) |
| Ticket | `TK-` | one-shot `face_value` admission | **rejected** — "redeemed at the venue" | seller admits at the door, `amount_applied = face_value` |

Gift cards deplete (balance 0 → `redeemed`); vouchers and tickets die on
first use. Lazy expiry: an expired code flips to `expired` the moment anyone
touches it.

### Creation & sale

- **Free issuance**: seller mints 1–100 coded instances per call (batch
  gifting, door lists).
- **Priced templates**: setting `price` creates a single template row plus an
  auto-created, seller-linked **published product** (the template's
  `product_id`). Each sale mints a **fresh coded instance per unit** to the
  buyer's email via the `order.placed` subscriber — templates themselves are
  never redeemable.
- Commission is taken **at purchase only**; redemption moves no money.
- **Instant escrow release** for seller orders that are redeemable-only (the
  seller has no goods to ship — the code *is* the product). Mixed orders keep
  the Phase 6 delivery-confirmation window.
- Admin reversal/clawback (`POST /admin/commissions/reverse`, Phase 5) is the
  dispute backstop.

### Two redemption doors

**Checkout (digital)** — `POST /store/carts/:id/apply-redeemable` prices the
code against the cart (store-scoped: 400 if the cart holds other sellers'
items; one code per cart; tickets rejected) and stages line-item adjustments +
cart metadata. `complete-marketplace` then **consumes the code first** and
places the order; if order placement fails after consumption, an undo
compensation restores the balance/status and deletes the audit row — the code
survives a failed checkout intact.

**In-store (physical)** — the buyer shows the code/QR, the owning seller posts
it to `POST /sellers/redeemables/redeem`. Foreign codes are invisible (404,
never 400) so codes can't be probed across stores.

### API

| Endpoint | Auth | Purpose |
|---|---|---|
| `GET /store/sellers/:handle` | publishable key | Storefront: profile + products + for-sale instruments (no codes) |
| `GET /store/redeemables/:code` | publishable key | Public code check → status, value, QR payload, issuing store |
| `POST /store/carts/:id/apply-redeemable` | publishable key | Apply a code to a cart (adjustments + metadata) |
| `GET /sellers/redeemables` | seller | List own instruments, filter `type`/`status` |
| `POST /sellers/redeemables` | seller | Mint free instances (quantity 1–100) or a priced template |
| `POST /sellers/redeemables/redeem` | seller | In-store redemption by code/QR |
| `POST /sellers/redeemables/:id/cancel` | seller | Cancel an own, still-active code |

### Testing

`integration-tests/http/redeemables.spec.ts`: 15 in-app tests — storefront
code-stripping, batch minting, validation 400s, public check, gift-card
drawdown to zero with replay/overdraw guards, voucher/ticket single-use,
cross-store 404s and store-scope 400s, lazy expiry, cancel, cart apply,
consume/undo compensation, and the subscriber (template minting + instant
release + idempotent replay). Plus the live-proof ritual against the dev
server in mock mode. Full suite: 7 spec files, 75 tests.

## Two-way Tipping (Phase 8)

Cash gratitude both ways — **buyer → seller** appreciation and **seller → buyer**
thank-you (cash or an extra product from their catalog). Tips deliberately ride
the existing settlement + payout rails: every cash tip is a **0% commission**
`commission_line` that lands in the seller's balance and flows out through the
already-built escrow → payout machinery. No second wallet.

- **Buyer → seller:** `POST /store/orders/:id/tip` (email ownership gate, Phase 6
  pattern) records the tip and an *immediately `available`* 0% commission line —
  the full amount nets to the seller.
- **Seller → buyer cash:** `POST /sellers/tips` deducts the amount from the
  seller's available balance (a negative 0% ledger line) and issues a recorded
  **buyer credit note** (`buyer_credit_code`, e.g. `CR-ABC123`). Redemption of the
  credit is deferred to a buyer-wallet phase.
- **Seller → buyer extra-product:** the same endpoint gifting an item
  (`product_id`/`product_title`) — **no money moves**, just the recorded gift.
- A seller can only gift cash they actually have available (400 otherwise).

| Endpoint | Auth | Purpose |
|---|---|---|
| `POST /store/orders/:id/tip` | publishable key + email | Buyer→seller cash tip |
| `GET /sellers/tips` | seller | List tips + summary (in/out/product) |
| `POST /sellers/tips` | seller | Seller→buyer cash or extra-product tip |

> Deferred (documented, not faked): standalone payment capture for a buyer tip and
> buyer-credit redemption — both pending a customer-account/wallet phase.

`docs/superpowers/plans/2026-08-01-phase8-tipping.md` +
`docs/superpowers/specs/2026-08-01-phase8-tipping-design.md` lock the design.

## Referral & Growth (Phase 9)

The **referral reward engine** — a seller invites a buyer by email and earns a
reward **only when that buyer's first transaction completes** (escrow released,
the Phase 6 anti-fraud gate — signups and pending orders never pay). Rewards ride
the existing settlement + payout rails as 0% commission lines, with a lifetime
cap per referrer.

- `POST /sellers/referrals` — seller invites a referee email → returns an
  unguessable `REF-…` share code. Re-inviting the same email is a no-op.
- `POST /store/referrals` — the referee binds their email to the code
  (unknown code → 404; code already bound to another email → 409).
- `GET /sellers/referrals` — **qualifies on read** (trust-score pattern): every
  `pending` referral is scanned against the referee email's orders; the first
  order whose commission line became `available` (escrow-released) writes the
  reward — once, idempotently — and returns the list + lifetime stats.
- Reward: 0% `available` CommissionLine to the referrer (default ₦2,000,
  `REFERRAL_SELLER_REWARD_NGN`), capped at lifetime earnings
  (`REFERRAL_SELLER_LIFETIME_CAP_NGN`, default ₦1,500,000 — roadmap). Past the
  cap, further referrals qualify with zero reward and a recorded cap reason.
- **Group buy** (the Pinduoduo team-discount half of this phase) is designed in
  the phase spec and scoped as a follow-up task.

| Endpoint | Auth | Purpose |
|---|---|---|
| `POST /sellers/referrals` | seller | Create a referral (referee email) |
| `GET /sellers/referrals` | seller | Auto-qualify + list + lifetime earnings |
| `POST /store/referrals` | publishable key | Referee claims a code with their email |

`docs/superpowers/plans/2026-08-01-phase9-growth.md` +
`docs/superpowers/specs/2026-08-01-phase9-growth-design.md` lock the design.




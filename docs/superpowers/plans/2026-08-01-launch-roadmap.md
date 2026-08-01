# Launch Roadmap — How's u (Phases 11+)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended)
> or superpowers:executing-plans to implement this plan task-by-task. This document is the
> **single source of truth for what comes next**. Every new session should start by reading
> this file, then the phase plan referenced by the current phase.

**Status snapshot (as of this file's last update):**
- Phases 1–13 are **implemented and green**; **Phase 14 KYC ladder is implemented** (couriers + sellers): progressive email-keyed ladder, OTP seam wired but OFF by default (`KYC_VERIFICATION_ENABLED`), configurable courier gate, seller level on `/sellers/me`.
- Integration tests: **13 suites / 145 tests pass**. `tsc --noEmit` clean. `medusa build` passes.
- Phase 13 is committed; **Phase 14 KYC is uncommitted** (kyc module + routes pending a conventional commit).
- Head commits: `25a3d50` (feat ai Phase 13), `0076159` (feat delivery Phase 12 chat/POD).

---

## Product North Star

A marketplace where **informal sellers and buyers can win**, built on two pillars:

1. **Ruthlessly simple seller/buyer experience** (phone-or-email signup, mobile-first listing, fast transparent payouts, commission only on success).
2. **A trust + delivery layer that makes the platform the obvious choice** (P2P delivery, escrow-style payment release, proof of delivery, ratings, simple dispute path).

### What we must avoid (the "killers")
- Forcing formal business registration or heavy documentation upfront.
- Complex admin panels that feel like enterprise software.
- Ignoring last-mile delivery and returns.
- Over-engineering. Every feature must serve the informal-seller/buyer path.

---

## Phase Map (dependency-ordered)

| Phase | Name | Dependency | Goal |
|---|---|---|---|
| 10 | Digital Mall + Buyer Wallet | — | **DONE.** bonding-curve events, luck prizes, buyer wallet |
| 11 | P2P Delivery Core | 10 (wallet), 5 (payouts), 6 (escrow) | Job posting, matching, negotiation, escrow release — **DONE** (routes + `delivery.spec.ts` green) |
| 12 | In-app Chat + POD verification | 11 | 3-way DM, timeline, in-app QR/OTP codes — **DONE** (chat + verify routes, party gating, POD payout) |
| 13 | AI Seller Intelligence | 3 (existing AI) | Daily/weekly briefs, marketing helper, grounded recommendations — **DONE** (brief + recommendations routes, scheduled job, `ai.spec.ts` green) |
| 14 | Frictionless Onboarding | 2 (marketplace auth) | Phone/email signup, mobile-first listing, progressive KYC — **KYC ladder + courier gate DONE** (phone signup/listing TODO) |
| 15 | Launch Gate | 11–14 | Live payments, deploy infra, hardening, GA checklist |

Phases 11 → 12 are strictly sequential. **13, 14 can run in parallel** with 11/12
(different modules, no shared files). Phase 15 is the GA gate and must not be skipped.

---

# Phase 11 — P2P Delivery Core

## Goal
Turn any completed order into a **delivery job** a store owner can post in one click.
Independent couriers (any user — a store owner, a buyer, or anyone) can take the job or
counter-offer. The agreed price is held in escrow and released only on confirmed delivery.

## Architecture decision (locked)
- **Build a custom Medusa module `delivery`, do NOT adopt Fleetbase or OpenCourier yet.**
  - Fleetbase is AGPL (copyleft — legal burden for a commercial launch) and a parallel
    logistics OS with its own DB/API that fights Medusa's wallet/escrow/payout model.
  - OpenCourier is a research/protocol reference (Princeton-HCI) — study its matching and
    auditability ideas, do not vendor its code.
  - The MVP scope (job → match → negotiate → confirm → release) is a clean custom module
    that reuses the Phase 6 escrow money-engine, Phase 5 payout rails, and buyer-wallet.
  - **Revisit Fleetbase later** only if route optimization + live GPS fleet ops justify
    the AGPL cost at scale. Document the seam so swapping the matching engine is possible.
- **Matching is simple first**: list open jobs (nearby = same city/state filter), courier
  claims or makes an offer, store owner accepts. No realtime dispatch in MVP.

## Module: `backend/src/modules/delivery/`
Models (all in `models/`):
- `DeliveryJob` — order ref, package description/weight, pickup location (store address),
  destination (buyer's saved shipping address), posted price, status
  (`open` → `negotiating` → `accepted` → `in_transit` → `delivered` | `cancelled`).
- `DeliveryOffer` — job ref, courier user ref, offered price, status (`pending` | `accepted` |
  `rejected` | `withdrawn`). Counter-offers are new rows (immutable offer history).
- `DeliveryParty` — a user (by actor type + id) linked to a job as `sender` (store owner),
  `courier`, or `recipient` (buyer). This powers the 3-way chat in Phase 12.

Service methods (`service.ts`, following the `mall` module conventions):
- `postJob(input)` — creates an `open` job from a completed order (pickup = store location,
  destination = order shipping address).
- `listOpenJobs(filters)` — `open` jobs, optional city/state filter.
- `makeOffer(jobId, courier, price)` — courier offers (or accepts posted price).
- `acceptOffer(jobId, offerId)` — store owner accepts; job → `accepted`; price locked.
- `counterOffer` — a new offer row (explicit immutable history).
- `markPickedUp(jobId)` — job → `in_transit` (safety: cancellation after pickup requires
  sender approval, inDrive pattern).
- `confirmDelivery(jobId, pod)` — recipient confirms; **escrow releases the agreed price**
  to the courier's payout account; job → `delivered`.
- `cancelJob(jobId, reason)` — pre-pickup: refund; post-pickup: requires sender approval.

Escrow integration (reuse Phase 6, do NOT build a new money engine):
- Delivery fee is collected/held using the existing escrow + settlement ledgers.
- On `confirmDelivery` the courier gets a commission line → rides the Phase 5 payout rails.

## API routes (`backend/src/api/`)
| Method | Path | Auth | Purpose |
|---|---|---|---|
| `POST` | `/store/delivery-jobs` | seller | Post a job from an order (one-click) |
| `GET` | `/store/delivery-jobs` | publishable key | Browse open jobs (buyer/courier view) |
| `GET` | `/store/delivery-jobs/:id` | publishable key | Job details |
| `POST` | `/store/delivery-jobs/:id/offers` | any authenticated actor | Make an offer / accept posted price |
| `POST` | `/store/delivery-jobs/:id/offers/:offerId/accept` | seller | Accept an offer (locks price) |
| `POST` | `/store/delivery-jobs/:id/cancel` | sender | Cancel (pre-pickup auto-approves) |
| `POST` | `/store/delivery-jobs/:id/confirm` | recipient | Confirm delivery → escrow release |

Middlewares: add schemas to `backend/src/api/middlewares.ts` (same pattern as mall).
Register module in `backend/medusa-config.ts` (same pattern as mall/buyer-wallet).

## Integration tests
`backend/integration-tests/http/delivery.spec.ts` — mirror `mall.spec.ts` style
(`medusaIntegrationTestRunner`, fixtures in `beforeAll`, publishable key header):
post job → browse → offer → accept → picked up → confirm → escrow release; cancellation
paths; counter-offer flow. **Full suite must stay green (11 suites + this one).**

## Acceptance criteria
- [x] A store owner can post a delivery job from a completed order in one call.
- [x] Any actor can browse open jobs and make an offer or counter-offer.
- [x] Only the store owner can accept; accepted price is immutable.
- [x] Cancel before pickup refunds; after pickup requires sender approval.
- [x] Confirmed delivery releases escrow to the courier's payout path.
- [x] `delivery.spec.ts` green; `tsc --noEmit` clean; `medusa build` passes.

## Commits (one per task, conventional)
`feat(delivery): ...` per task (module → service → routes → tests → docs).

---

# Phase 12 — In-app Chat + POD verification

## Goal
The **3-way DM** (sender ↔ courier ↔ recipient) that opens once a job is accepted, with a
timeline and **in-app QR/OTP codes** for pickup and delivery confirmation. No email/SMS
budget — codes live inside the app.

## Architecture decision (locked)
- **REST message model + polling first.** A `Conversation`/`Message` table with a simple
  `GET /store/delivery-jobs/:id/chat` poll endpoint. No WebSocket in MVP.
- **Upgrade path**: Redis pub/sub (already in the stack via `event-bus-redis`) → WebSocket/SSE
  later. Keep message-write behind a service method so the transport can change.
- **OTP/QR**: generate a short numeric code + QR payload per pickup and per delivery;
  store only a hash; the recipient/courier reads it inside the app (Phase 12). In-app only.

## Module additions
- `delivery` module gains: `Conversation`, `Message`, `DeliveryVerification` (code hash,
  purpose `pickup`|`delivery`, expires_at, status).
- Service methods: `openConversation(jobId)` (auto-created on accept), `sendMessage`,
  `listMessages`, `generateVerification(jobId, purpose)`, `verify(jobId, code, purpose)`.

## API routes
| Method | Path | Auth | Purpose |
|---|---|---|---|
| `GET` | `/store/delivery-jobs/:id/chat` | any job party | Timeline + messages (poll) |
| `POST` | `/store/delivery-jobs/:id/chat` | any job party | Send a message |
| `POST` | `/store/delivery-jobs/:id/verify/pickup` | courier | Generate pickup code |
| `POST` | `/store/delivery-jobs/:id/verify/delivery` | courier | Generate delivery code |
| `POST` | `/store/delivery-jobs/:id/verify` | recipient/sender | Submit code → confirms pickup/delivery |

## Acceptance criteria
- [x] Accepted job auto-opens a 3-way conversation (sender, courier, recipient).
- [x] Messages are persisted and pollable; timeline shows pickup/delivery events.
- [x] Pickup and delivery each require an in-app code; only the right party can generate/verify.
- [x] Verification events post into the chat timeline.
- [x] `delivery.spec.ts` extended (or new `chat.spec.ts`); full suite green.

---

# Phase 13 — AI Seller Intelligence

## Goal (non-over-engineered)
1. **Single source of truth** — order/product/customer/delivery data flowing into one
   queryable surface the AI can use (already largely true via Phase 3 per-store insights).
2. **Daily/weekly brief** — "Revenue X, margin Y, these 3 SKUs/regions underperforming,
   top 2 opportunities ranked by expected impact."
3. **Marketing helper** — draft descriptions/social posts/promo ideas grounded in the
   store's own best-sellers and margins, not generic advice.
4. **Simple recommendations** — "Raise price on this SKU by 8%", "Push this bundle",
   "These customers are ripe for win-back." **Always store-specific.**

## What changes (extend, don't rebuild)
- Phase 3 already has per-store AI with seller-scoped queries. This phase **adds**:
  - `POST /sellers/ai/brief` — daily/weekly digest: deterministic math (revenue, margin,
    top/bottom SKUs, regions) + LLM narrative + ranked opportunities.
  - `POST /sellers/ai/recommendations` — rule-based candidate list (price uplift, bundle,
    win-back lists) ranked by expected impact; LLM explains each in one line.
  - Scheduled brief: a Medusa **job** (see `backend/src/jobs/` pattern in the repo) that
    generates and stores the daily brief so `GET /sellers/ai/brief` is instant.
- Keep the existing quota guard (`AI_FREE_TIER_MONTHLY_LIMIT`) and provider abstraction
  (`AI_PROVIDER=groq|mock|mock-fail`) — no new infra, no per-seller keys.

## Acceptance criteria
- [x] `GET/POST /sellers/ai/brief` returns deterministic numbers + ranked opportunities.
- [x] `GET/POST /sellers/ai/recommendations` returns store-specific, rule-ranked actions.
- [x] Recommendations are provably scoped to the requesting seller only.
- [x] Mock provider returns deterministic canned output (testable offline).
- [x] `ai.spec.ts` extended; full suite green.

---

# Phase 14 — Frictionless Onboarding

## Goal
Sellers go live with **email-or-phone + password**, then later add bank details for payouts
and a few product photos. Progressive KYC (NIN etc.) is an unlock later, not a wall.

## Scope
- **Phone signup**: extend the auth flow so a phone number can be the login identifier
  (in-app verification code — same Phase 12 OTP pattern, no SMS cost; or email fallback). **TODO**
- **Onboarding flow** (`POST /sellers` extend): email/phone + basic profile; payout account
  setup is first-class but optional until first payout (Phase 5 already has payout accounts). **TODO**
- **Mobile-first listing**: harden `POST /sellers/products` for photo + price + short
  description (exists; verify the create-product workflow accepts this minimal shape). **TODO**
- **Progressive verification ladder** — **DONE** (kyc module): email-keyed ladder
  `unverified → phone_verified → identity_verified` (`kyc_profile` + `kyc_otp`, OTP via the
  Phase 12 hash/TTL pattern). Routes: `POST /kyc/request|verify`, `POST /kyc/identity`,
  `GET /kyc/status`. NIN stored as last-4 tail only. **Verification sending is WIRED BUT OFF**
  by default — nothing emails/SMSes until `KYC_VERIFICATION_ENABLED=true`; then
  `KYC_VERIFICATION_CHANNEL=mock|email|whatsapp` (mock returns the code, email=Resend-style,
  whatsapp=Business Cloud API). Courier gate `KYC_COURIER_GATE_ENABLED` blocks unverified
  couriers from making delivery offers; seller level surfaced on `GET /sellers/me`.
- **Avoid**: enterprise-style admin panels, forced registration docs.

## Acceptance criteria
- [ ] New seller can register with phone or email + password. (email done; phone signup TODO)
- [ ] Listing = photo + price + description; works mobile-first. (existing product flow; mobile pass TODO)
- [x] Payout account setup is possible without blocking account creation.
- [x] `kyc_level` tracked and surfaced in seller profile (and courier profile via `/kyc/status`).
- [x] Courier KYC gate exists (off by default) and is covered by tests; marketplace/referrals/auth specs green.
- [x] Full suite green: **13 suites / 145 tests** (`kyc.spec.ts` added).

---

# Phase 15 — Launch Gate (GA readiness)

## Goal
Convert a great local MVP into something that can take real money and real users.

## Blocker checklist (must all be done)
- [ ] **Real payments**: Paystack (+ Flutterwave) live keys wired, webhooks reliable with
      retries/idempotency, payout accounts real. Crypto (Circle) quotes from a real oracle,
      not the hardcoded placeholder.
- [ ] **Wallet withdrawal rail**: buyer-wallet balances can actually withdraw via Paystack
      Transfers (the documented stub becomes real).
- [ ] **Deploy infra**: backend Dockerfile, hosted Postgres + Redis, CI/CD pipeline,
      environment-secret management. (Currently `docker compose` local only.)
- [ ] **Security pass**: real JWT/COOKIE secrets, tightened CORS, rate limiting on
      auth/checkout/referrals/OTP, admin RBAC review, no secrets in repo.
- [ ] **Observability**: structured prod logging, error tracking, payment webhook monitoring.
- [ ] **Legal/financial**: T&Cs, payout terms, escrow/refund policy, money-handling
      compliance for NGN movement.

## Acceptance criteria
- [ ] End-to-end real payment test on live keys in a staging env.
- [ ] A seller can register, list, sell, and get paid real money.
- [ ] A buyer can pay, receive, and confirm; delivery courier gets paid.
- [ ] Deploy docs + one-click production deploy runbook exist.

---

# Handoff protocol for the next session

1. **Read this file first** (`docs/superpowers/plans/2026-08-01-launch-roadmap.md`), then the
   phase's own plan/spec docs in `docs/superpowers/plans/` + `docs/superpowers/specs/`.
2. **Check current state**: `git status`, `git log --oneline -5`, and which phase checklist
   item is the first unchecked box. Start exactly there.
3. **Conventions** (Phases 1–10): backend-only changes; MedusaError→HTTP mapping;
   `tsc --noEmit` clean; one conventional commit per task
   (`feat(scope):`, `fix(scope):`, `docs(plan):`, `test(scope):`); integration tests run via
   the documented `DB_HOST/DB_PORT/DB_USERNAME/DB_PASSWORD` env invocation, then polled.
4. **Test gotchas learned**: the `medusaIntegrationTestRunner` **restores the DB snapshot
   before every test** — shared fixtures MUST live in `beforeAll`, never created in an
   earlier `it`. Boot can exceed 120s on cold cache — keep `jest.setTimeout` ≥ 240s in new specs.
5. **Store routes** require the `x-publishable-api-key` header even for authenticated sellers
   (the store namespace enforces it). `req.auth_context.actor_id` is the `seller_admin` id —
   resolve the seller via `seller_admin → seller.id` graph query (see referrals/mall routes).
6. **When a phase is complete**: update the checklist above, mark it done, update this
   Status snapshot, and commit the roadmap update in the same conventional style.

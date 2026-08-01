# Phase 9 — Referral & Group-buy Growth Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended)
> or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Two growth loops from the recorded roadmap:
1. **Referral reward engine** — a seller refers a buyer; both benefit, but the
   reward pays **only when the referee's first transaction COMPLETES** (escrow
   released — Phase 6 makes this gate real). Rewards ride the existing settlement
   + payout rails (0% commission lines), with lifetime caps.
2. **Group buy** — Pinduoduo-style team discounts. **SCOPE NOTE:** this is the
   heavy checkout-integration half (seller-configured tiered price drops, group
   sessions, share links, discount application); it is designed here and executed
   as a follow-up task within this phase.

**Architecture:** New custom module `growth` owning the `Referral` model. It stays
pure (like `reviews`/`tipping`): qualification + reward settlement are composed in
the route layer against `marketplace` commission lines. Qualification is evaluated
**on read** (trust-score pattern) — a pending referral is scanned against the
referee email's orders whenever the seller views their referrals, so no new event
bus is needed and nothing can double-pay.

**Spec:** `docs/superpowers/specs/2026-08-01-phase9-growth-design.md`.

**Conventions** (Phases 1–8): backend only; MedusaError→HTTP mapping; `tsc --noEmit`
clean; one conventional commit per task; integration tests run detached, then polled.

## File Structure

```
backend/src/
  modules/growth/
    models/referral.ts             ← Referral model
    service.ts                     ← pure: create/claim/list/stats + qualification math
    index.ts                       ← Module(GROWTH_MODULE, { service })
    migrations/Migration*.ts       ← generated
  api/
    sellers/referrals/route.ts     ← POST create + GET list/stats (auto-qualify)
    store/referrals/route.ts       ← POST claim { code, email }
  integration-tests/http/growth.spec.ts    ← NEW spec
docs/
  superpowers/plans/2026-08-01-phase9-growth.md
  superpowers/specs/2026-08-01-phase9-growth-design.md   ← NEW
```

## Task 1 — Referral module (model, service, registration, migration)

- [x] **Step 1:** `Referral` model (code unique, referrer_role, referrer_seller_id,
  referee_email, status `pending|qualified`, reward_amount, paid_at, metadata).
- [x] **Step 2:** service — `createForSeller`, `claimByCode`, `markQualified`,
  `listForSeller`, `statsForSeller`. Pure; ledger delegated to the route.
- [x] **Step 3:** `index.ts` + register `./src/modules/growth` in `medusa-config.ts`.
- [x] **Step 4:** generated `Migration20260801082759.ts`; committed.

## Task 2 — API, qualification + tests

- [x] **Step 1:** schemas (`PostReferralCreateSchema`, `PostReferralClaimSchema`) +
  middlewares entries.
- [x] **Step 2:** `POST /sellers/referrals` + `GET /sellers/referrals`
  (GET runs on-read qualification).
- [x] **Step 3:** `POST /store/referrals` claim (code 404, already-claimed 409).
- [x] **Step 4:** qualification reward — 0% `available` CommissionLine to the
  referrer seller, capped by lifetime cap, issued once per referral.
- [x] **Step 5:** `growth.spec.ts` 7 tests GREEN (code creation, no-double invite,
  claim 409/404, pays only on escrow release, idempotent once-only, unreleased
  never pays); README section; `tsc --noEmit` clean; committed.

## Task 3 — Group buy (scoped follow-up, designed in spec)

- [ ] Tiered price drops per seller product; group sessions; share links; apply
  at checkout.

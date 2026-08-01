# Phase 8 — Two-way Tipping Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended)
> or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Cash tips both ways between buyers and sellers — buyer → seller
appreciation, and seller → buyer thank-you (cash or an extra product). Tips ride
the **existing settlement + payout rails** (the roadmap's explicit ask): every tip
is a ledger line with **0% commission** that lands in the seller's balance and flows
through the already-built escrow → payout machinery.

**Architecture:** A new custom module `tipping` owns the `Tip` model (the social/
human fact: direction, buyer email, amount, optional extra product, note). It knows
nothing about money movement by itself; settlement is delegated to the existing
`marketplace` module by writing `CommissionLine` rows through that module's service
(0% commission, `net_amount = tip amount`). This reuses every phase 5/6 primitive
(balances, payouts, reversal) instead of re-inventing a second wallet.

**Spec:** `docs/superpowers/specs/2026-08-01-phase8-tipping-design.md` — all locked
decisions live there (two directions, 0% platform commission on tips, immediate
`available` settlement, seller→buyer cash = negative ledger line + buyer credit note,
extra-product tips record the gift, payment capture deferred).

**Conventions that apply to every task** (established Phases 1–7):
- Backend only, inside `backend/`. Mock mode first — no new env vars.
- MedusaError → HTTP: NOT_FOUND→404, NOT_ALLOWED→400, CONFLICT→409,
  INVALID_DATA→400, UNAUTHORIZED→401.
- `npx tsc --noEmit` clean after every task. One conventional commit per task.
- Jest (PowerShell 5.1): use the detachment pattern (`Start-Process ... > file 2>&1`)
  then poll `file`, because the harness boots the full app (~2 min).
- `npx medusa db:generate tipping` can exceed 180s — background with `Tee-Object`.

## File Structure

```
backend/src/
  modules/tipping/                 ← NEW module (5th custom)
    models/tip.ts                  ← Tip model
    service.ts                     ← create/list/summary + ledger delegate
    index.ts                       ← Module(TIPPING_MODULE, { service })
    migrations/Migration*.ts       ← generated
  api/
    store/orders/[id]/tip/route.ts         ← POST buyer→seller tip (email gate)
    sellers/tips/route.ts                  ← GET list + POST seller→buyer tip
  integration-tests/http/tipping.spec.ts   ← NEW spec

docs/
  superpowers/plans/2026-08-01-phase8-tipping.md
  superpowers/specs/2026-08-01-phase8-tipping-design.md   ← NEW
```

## Task 1 — Module scaffold: model, service, registration, migration

- [x] **Step 1: `Tip` model** (`modules/tipping/models/tip.ts`)
- [x] **Step 2: service** (`modules/tipping/service.ts`) — pure `Tip` record keeper
  (`createTip`, `listForSeller`, `summary`); marketplace ledger orchestration lives
  in the route layer (reviews-module pattern).
- [x] **Step 3: `index.ts`** — `export const TIPPING_MODULE = "tipping"` +
  `Module(TIPPING_MODULE, { service })`.
- [x] **Step 4:** register `./src/modules/tipping` in `medusa-config.ts`.
- [x] **Step 5:** generated `Migration20260801081135.ts` + snapshot.

## Task 2 — API + middlewares + tests

- [x] **Step 1:** schemas in `src/api/middlewares.ts`
  (`PostBuyerTipSchema`, `PostSellerTipSchema`) + `validateAndTransformBody` entries.
- [x] **Step 2:** `POST /store/orders/:id/tip` (buyer→seller, `assertOrderEmail` gate).
- [x] **Step 3:** `GET /sellers/tips` + `POST /sellers/tips` (seller→buyer).
- [x] **Step 4:** `integration-tests/http/tipping.spec.ts` — 7 in-app tests GREEN
  (buyer tip settlement, 404 email gate, 400 amount, cash-back deduction + credit
  note, insufficient-balance 400, extra-product gift, list + summary).
- [x] **Step 5:** root `README.md` Phase 8 section; `tsc --noEmit` clean; committed.

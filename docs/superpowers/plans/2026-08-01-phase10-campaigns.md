# Phase 10 — Digital Mall (Gamified Marketplace Events)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended)
> or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** A **digital mall** — a gamified, time-boxed marketplace event where sellers co-create
a "mall stand" that doesn't go live until it hits a bonding-curve threshold (5 sellers + 10 buyers).
Sellers fund a **prize pool** (their ad budget + optional redeemable gifts: gift cards, vouchers, tickets).
Buyers who purchase from the mall get **luck-based cash prizes** drawn from the pool.
Malls expire after max 30 days; unfunded malls refund everyone; expired malls return remaining
funds proportionally. Gen Z vibe, meme-coin launch energy, no cheating.

**Architecture:** A new custom module `mall` owning `Mall` (the event), `MallSeller` (a seller's
contribution + optional redeemable gift), `MallBuyer` (a buyer's participation), and `MallPrize`
(tracking prize draws). The **buyer-wallet** module (built in Phase 10 Task 1) is the payout surface
for prizes and refunds. Seller cash contributions ride the existing settlement rails.

**Spec:** `docs/superpowers/specs/2026-08-01-phase10-campaigns-design.md` — all locked decisions,
including the bonding-curve launch, luck-based prize mechanics, and refund logic.

**Conventions** (Phases 1–9): backend only; MedusaError→HTTP mapping; `tsc --noEmit` clean;
one conventional commit per task; integration tests run detached then polled.

## File Structure

```
backend/src/
  modules/mall/
    models/mall.ts                 ← Mall (status, thresholds, prize config, expiry)
    models/mall-seller.ts          ← a seller's contribution + optional redeemable gift
    models/mall-buyer.ts           ← a buyer's participation + purchase tracking
    models/mall-prize.ts           ← a prize award to a buyer
    service.ts                     ← pure CRUD + threshold checks + prize draws + refunds
    index.ts                       ← Module(MALL_MODULE, { service })
    migrations/Migration*.ts       ← generated
  modules/buyer-wallet/            ← NEW: a genuine buyer balance + credit ledger
    models/wallet.ts               ← per-email buyer wallet (currency → balance)
    models/wallet-ledger.ts        ← append-only credit/debit lines (source-tagged)
    service.ts                     ← credit/debit/list/withdraw-stub
    index.ts                       ← Module(BUYER_WALLET_MODULE, { service })
    migrations/Migration*.ts       ← generated
  api/
    store/malls/route.ts           ← GET list (my malls), POST create (seller)
    store/malls/[id]/route.ts      ← GET details
    store/malls/[id]/join/route.ts ← POST join as seller (contribute + redeemable)
    store/malls/[id]/join-buyer/route.ts ← POST join as buyer (express interest)
    store/malls/active/route.ts    ← GET browse active malls (publishable key)
    store/malls/[id]/purchase/route.ts ← POST record purchase (triggers prize draw)
    admin/malls/[id]/go-live/route.ts ← POST force-activate (admin override)
  integration-tests/http/mall.spec.ts ← NEW spec
docs/
  superpowers/plans/2026-08-01-phase10-campaigns.md
  superpowers/specs/2026-08-01-phase10-campaigns-design.md   ← NEW
```

## Task 1 — Buyer wallet module (the gating dependency)

- [ ] models (`wallet`, `wallet_ledger`), service (`credit`, `debit`, `balance`,
  `listLedger`), index, register, migration.

## Task 2 — Mall module (models, service, registration, migration)

- [ ] `Mall` + `MallSeller` + `MallBuyer` + `MallPrize` models; service
  (`create`, `joinAsSeller`, `joinAsBuyer`, `checkThresholds`, `activate`,
  `recordPurchase`, `drawPrizes`, `expire`, `refund`, `list`, `getDetails`);
  index + register; migration.

## Task 3 — APIs + middlewares + integration tests

- [ ] seller create/join + buyer browse/join/purchase + admin go-live;
  prize draws tied to purchase events; `mall.spec.ts` green;
  README + env; commit.

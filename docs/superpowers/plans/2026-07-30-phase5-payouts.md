# Phase 5 — Payouts & Settlement (money-out, backend only)

## Summary

Complete the money-out flow for "How's u". Backend only — no UI/storefront work
(deferred), no buyer-side AI (Phase 6).

- **Settlement balance**: the Phase 2 commission ledger grows a real state
  machine — `pending → available → reserved → paid` plus `reversed` — with a
  configurable clearance window and refund/chargeback reversals (including
  clawback offsets for already-paid lines).
- **Payout entity + lifecycle**: `requested → processing → paid | failed |
  reversed`, idempotency keys (no double-pay on replay), provider references,
  attempt tracking, destination snapshots.
- **Fiat rail**: **Paystack Transfers** — seller bank-account model, bank
  name-resolve, transfer-recipient creation, transfer initiation,
  `transfer.success|failed|reversed` webhooks, and poll-based reconcile.
- **Crypto rail**: network-agnostic **USDC withdrawal** through the existing
  `CryptoSettlement` seam (Circle developer-controlled wallets, Base/Solana,
  testnet default) to a seller-registered address.
- **Phase 4 gap fix**: crypto **deposit correlation** — per-intent deposit
  wallets + amount matching replace the shared-wallet
  first-inbound-transfer-wins PoC shortcut.
- **Scheduling + safety**: admin-triggered and cron payouts, minimum threshold,
  hold/clearance window, workflow compensation on failure, deterministic
  offline mock modes for every provider call.

Non-goals: any frontend, live Paystack/Circle keys, partial-amount payouts
(payouts sweep the full available balance), a real NGN↔USDC oracle
(fixed `CRYPTO_NGN_PER_USDC` rate carries over), buyer-side AI.

## Guiding constraints (carried from the project)

- STRICT two-folder separation: all work is in `backend/`. No frontend.
- Medusa module isolation: cross-module reads via `query.graph`; payout models
  live in the marketplace module (they hang off `Seller`).
- Money math is deterministic and lives in code; providers never invent totals.
  Ledger amounts are **major units** (matches commission lines); Paystack
  transfer API amounts are kobo (×100 at the API boundary only).
- Mock mode is the default everywhere (`PAYSTACK_SECRET_KEY=mock`,
  `CIRCLE_API_KEY=mock`) — tests and dev run offline with zero external keys.
- PowerShell 5.1: `;` not `&&`; dev-server/test logs OUTSIDE `backend/`.
- **Path note**: the workspace was renamed to `C:\Users\mosho\Desktop\howsyou`
  (no apostrophe). Try `db:*` and jest directly from the real path first; if
  fast-glob still misbehaves, fall back to the proven junction
  (`C:\Users\mosho\howsu-link\backend` + `--preserve-symlinks
  --preserve-symlinks-main`) and subst-X: + `realpath-alias.js` procedures from
  the Phase 2/3 plans. Env vars for jest are set manually in PowerShell (the
  npm script uses unix-style prefixes).

## Settlement model (decisions locked)

- `CommissionLine.status` becomes
  `pending | available | reserved | paid | reversed` (existing rows stay
  `pending` — still valid).
- **Clearance**: a line older than `PAYOUT_CLEARANCE_DAYS` flips
  `pending → available` (cron + on-demand service call; sets `available_at`).
- **Reserve**: a payout sweeps ALL `available` lines for (seller, currency) —
  no partial amounts, no line splitting. Reserved lines carry `payout_id`.
- **Reversal** (refund/chargeback):
  - line not yet `paid` → status `reversed` (+ `reversal_reason`), excluded
    from balances; `reserved` lines cannot be reversed while a payout is in
    flight (reject with 409 — reconcile first).
  - line already `paid` → keep it, write an **offset line** (same seller,
    negated `order_total/commission_amount/net_amount`, `order_id` =
    `"<order_id>:reversal"`, status `available`) so the clawback nets out of
    the next payout.
- **Payout lifecycle**: `requested → processing` (provider accepted, reference
  stored) `→ paid` (webhook/reconcile confirm; lines `reserved → paid`) or
  `→ failed` (lines released `reserved → available`, `failure_reason` kept) or
  `→ reversed` (money bounced back after paid; lines `paid → available`).
- **Idempotency**: `payout.idempotency_key` is unique; re-running the workflow
  with a known key returns the existing payout untouched. The provider-side
  reference is always `payout.id`, so a crash between "transfer sent" and
  "reference persisted" is caught by Paystack's duplicate-reference rejection
  + reconcile.

---

## Task 1 — Env, models, migration, balance service

**Files**: `backend/.env.template`,
`backend/src/modules/marketplace/models/commission-line.ts`,
`backend/src/modules/marketplace/models/payout.ts` (new),
`backend/src/modules/marketplace/models/payout-account.ts` (new),
`backend/src/modules/marketplace/models/seller.ts`,
`backend/src/modules/marketplace/service.ts`,
`backend/src/modules/marketplace/migrations/` (generated).

- `.env.template` — append:
  ```
  # Payouts & settlement (Phase 5)
  PAYOUT_CLEARANCE_DAYS=7            # pending -> available hold window
  PAYOUT_MIN_NGN=5000                # minimum available NGN (major units) per payout
  PAYOUT_SCHEDULE_ENABLED=false      # cron payouts off by default in dev
  # Paystack Transfers reuses PAYSTACK_SECRET_KEY; Circle payouts reuse CIRCLE_*.
  ```
- `commission-line.ts` — status enum becomes
  `["pending", "available", "reserved", "paid", "reversed"]` (default
  `pending`); add `available_at` dateTime nullable, `payout_id` text nullable,
  `reversal_reason` text nullable.
- `payout.ts`:
  ```ts
  const Payout = model.define("payout", {
    id: model.id().primaryKey(),
    currency_code: model.text(),
    amount: model.bigNumber(),
    rail: model.enum(["paystack", "crypto-usdc"]),
    status: model
      .enum(["requested", "processing", "paid", "failed", "reversed"])
      .default("requested"),
    idempotency_key: model.text().unique(),
    provider_reference: model.text().nullable(),
    destination: model.json(),           // snapshot of the account used
    failure_reason: model.text().nullable(),
    attempts: model.number().default(0),
    requested_by: model.enum(["seller", "admin", "schedule"]).default("seller"),
    paid_at: model.dateTime().nullable(),
    seller: model.belongsTo(() => Seller, { mappedBy: "payouts" }),
  })
  ```
- `payout-account.ts`:
  ```ts
  const PayoutAccount = model.define("payout_account", {
    id: model.id().primaryKey(),
    type: model.enum(["bank_account", "crypto_address"]),
    currency_code: model.text().default("ngn"),
    bank_code: model.text().nullable(),        // bank_account
    account_number: model.text().nullable(),
    account_name: model.text().nullable(),     // set by Paystack name-resolve
    recipient_code: model.text().nullable(),   // Paystack transferrecipient
    network: model.text().nullable(),          // crypto_address: base | solana
    address: model.text().nullable(),
    is_default: model.boolean().default(false),
    status: model
      .enum(["unverified", "verified", "failed"])
      .default("unverified"),
    seller: model.belongsTo(() => Seller, { mappedBy: "payout_accounts" }),
  })
  ```
- `seller.ts` — add `payouts` + `payout_accounts` hasMany relations.
- `service.ts` — register the two models and add domain methods (AI-service
  style):
  - `getSellerBalance(sellerId)` → per-currency
    `{ pending, available, reserved, paid_out }` (sum of `net_amount` by
    status; `reversed` excluded).
  - `clearPendingLines(now = new Date())` → flip `pending → available` where
    `created_at <= now - PAYOUT_CLEARANCE_DAYS`, set `available_at`; returns
    count. Clearance days read from env with a sane default (7).
  - `reverseCommissionForOrder(orderId, reason)` → the reversal/clawback rules
    from the settlement model above; throws typed errors for
    not-found / reserved-in-flight.
- Migration — FROM the workspace (fall back to junction if glob fails):
  ```powershell
  cd C:\Users\mosho\Desktop\howsyou\backend
  npx medusa db:generate marketplace
  npx medusa db:migrate
  ```

**Done when**: migration applies (enum widened, two new tables), tsc clean,
`npm run dev` boots, existing commission lines still readable.

---

## Task 2 — Paystack Transfers client + seller payout accounts

**Files**: `backend/src/lib/payments/payouts/paystack-transfers.ts` (new),
`backend/src/api/sellers/payout-accounts/route.ts` (new),
`backend/src/api/middlewares.ts` (schema only).

- `paystack-transfers.ts` — pure client on top of the existing
  `lib/payments/http.ts` helper; reads `PAYSTACK_SECRET_KEY`. Mock mode
  (key absent/empty/`"mock"`), deterministic + offline, with a module-level
  state map like the crypto mock:
  - `resolveAccount(account_number, bank_code)` →
    live `GET /bank/resolve`; mock returns
    `{ account_name: "MOCK ACCOUNT <last4>" }`, and **fails** (typed error)
    when `account_number` starts with `"00"` (lets tests prove the
    verify-fail path).
  - `createRecipient({ name, account_number, bank_code })` →
    live `POST /transferrecipient` (type `nuban`); mock returns
    `recipient_code: "RCP_mock_<account_number>"`.
  - `initiateTransfer({ amount_major, recipient_code, reference, reason })` →
    live `POST /transfer` (amount ×100 to kobo, currency NGN); mock registers
    the reference and returns
    `{ transfer_code: "TRF_mock_<reference>", status: "pending" }`; a
    reference containing `"fail"` will fail on verify.
  - `verifyTransfer(reference)` → live `GET /transfer/verify/:reference`;
    mock: first call `"pending"`, later calls `"success"` (or `"failed"` for
    `"fail"` references) — mirrors the crypto mock's pending→confirmed shape.
- `POST /sellers/payout-accounts` — body (Zod in `middlewares.ts`,
  discriminated by `type`):
  - `{ type: "bank_account", bank_code, account_number }` → resolve name →
    create recipient → store `verified` account with `account_name` +
    `recipient_code`. Resolve failure → account NOT stored, 400 with the
    provider message.
  - `{ type: "crypto_address", network: "base" | "solana", address }` →
    minimal shape validation (0x-hex-40 for base, base58 length 32–44 for
    solana), stored `verified` (on-chain validation is the transfer itself).
  - First account of its type becomes `is_default: true`.
- `GET /sellers/payout-accounts` — list own accounts. Auth: both routes
  inherit the existing `/sellers/*` seller authenticate matcher; actor
  resolution copies the `seller_admin` → seller pattern from
  `sellers/me/route.ts`.

**Done when**: mock resolve/recipient round-trip stores a verified bank
account; `"00..."` account number is rejected and stores nothing; crypto
address validation works; tsc clean.

---

## Task 3 — Crypto seam: withdrawals + Phase 4 correlation gap fix

**Files**: `backend/src/lib/payments/crypto/adapter.ts`,
`backend/src/lib/payments/crypto/mock.ts`,
`backend/src/lib/payments/crypto/circle.ts`,
`backend/src/modules/payment-providers/crypto-usdc/service.ts`,
`backend/integration-tests/http/payments.spec.ts` (signature updates only).

- `adapter.ts` — extend the seam (stays network-agnostic):
  ```ts
  export interface SettlementQuery {
    reference: string
    wallet_id?: string        // per-intent deposit wallet (correlation fix)
    expected_usdc?: string    // amount matching
  }
  export interface WithdrawalStatus {
    reference: string
    status: "pending" | "confirmed" | "failed"
    tx_hash?: string
  }
  export interface CryptoSettlement {
    readonly network: CryptoNetwork
    readonly env: NetworkEnv
    createDepositIntent(input: { reference: string; usdc_amount: string }): Promise<DepositIntent>
    checkSettlement(query: SettlementQuery): Promise<SettlementStatus>
    createWithdrawal(input: { reference: string; address: string; usdc_amount: string }): Promise<WithdrawalStatus>
    checkWithdrawal(reference: string): Promise<WithdrawalStatus>
  }
  ```
- **Correlation gap fix** in `circle.ts`:
  - `createDepositIntent` provisions a **fresh wallet per intent**
    (`refId: reference`) instead of the shared cached wallet — each checkout
    gets its own deposit address. (Testnet-PoC cost note stays in a comment.)
  - `checkSettlement({ reference, wallet_id, expected_usdc })` lists
    transactions on **that wallet only** and requires an INBOUND COMPLETE
    transfer with amount ≥ `expected_usdc` (when provided). Missing
    `wallet_id` → `pending` (never guesses another intent's wallet). The
    Phase 4 "PoC LIMITATION" comment is deleted.
  - `createWithdrawal` sends USDC via the SDK's create-transaction call from
    the platform treasury wallet (provisioned/cached per network+env — the
    old shared-wallet role, now outbound-only) to the seller address, with
    `refId: reference`; `checkWithdrawal` polls the transaction state by
    refId. As in Phase 4: adapt to the installed SDK surface, keep the
    interface stable.
  - `mock.ts` — same interface: per-reference state map; withdrawals are
    `pending` on first check, `confirmed` after (tx hash `0xmockout<ref>`);
    an address containing `"fail"` yields `failed`.
- `crypto-usdc/service.ts` — `settlementStatus` now passes
  `{ reference, wallet_id, expected_usdc: usdc_amount }` from the session
  data (already stored there since Phase 4). No other behavior change.
- `payments.spec.ts` — update the two `checkSettlement` call sites to the
  object signature; add one assertion that two concurrent mock intents do NOT
  cross-confirm.

**Done when**: full existing payments spec still green with the new
signature; deposit intents carry distinct per-intent addresses; mock
withdrawal goes pending→confirmed deterministically; tsc clean.

---

## Task 4 — create-payout workflow + seller payout APIs

**Files**: `backend/src/workflows/marketplace/create-payout/index.ts` (new),
`backend/src/workflows/marketplace/create-payout/steps/{reserve-commission-lines.ts,create-payout-record.ts,initiate-payout-transfer.ts}` (new),
`backend/src/api/sellers/payouts/route.ts` (new),
`backend/src/api/sellers/balance/route.ts` (new),
`backend/src/api/middlewares.ts` (schema),
`backend/src/modules/marketplace/service.ts` (transition methods).

- Workflow `create-payout`, input `{ seller_id, rail, idempotency_key,
  requested_by }`:
  1. Query seller + default verified payout account for the rail
     (`bank_account` for paystack, `crypto_address` for crypto-usdc) — missing
     account → typed INVALID_DATA error.
  2. **Idempotency guard**: existing payout with `idempotency_key` → workflow
     returns it immediately (no steps run — checked first, like the
     seller-order links check in `create-seller-orders`).
  3. `clearPendingLines()` then compute available balance; below
     `PAYOUT_MIN_NGN` (or zero) → typed NOT_ALLOWED error.
  4. `reserveCommissionLinesStep` — flip the swept lines
     `available → reserved` (+`payout_id`); **compensation** releases them
     back to `available`.
  5. `createPayoutRecordStep` — payout row `requested` with amount = swept
     sum, destination snapshot; **compensation** deletes the row.
  6. `initiatePayoutTransferStep` — paystack rail: `initiateTransfer`
     (reference = payout id, amount NGN major); crypto rail: `quoteUsdc(amount)`
     then `createWithdrawal` to the stored address. On success → payout
     `processing` + `provider_reference`, `attempts` +1. On throw → the step
     fails, compensations run (lines released, row deleted) and the error
     propagates — **no double-pay, no stuck reservation**.
- `service.ts` transition methods (single-write, no workflow needed):
  `markPayoutPaid(id)` (payout `paid` + `paid_at`; lines `reserved → paid`),
  `markPayoutFailed(id, reason)` (payout `failed`; lines released),
  `markPayoutReversed(id)` (payout `reversed`; lines `paid → available`).
  Each is a no-op if the payout is already in the target state (webhook +
  reconcile may race — idempotent transitions).
- `GET /sellers/balance` → `{ balances: getSellerBalance(...),
  clearance_days, minimum_ngn }`.
- `POST /sellers/payouts` — body
  `{ rail: "paystack" | "crypto-usdc", idempotency_key?: string }` (Zod);
  key defaults to a fresh UUID; runs the workflow as the authenticated
  seller; returns the payout. Replay with the same key returns the SAME
  payout (200, identical id).
- `GET /sellers/payouts` — own payout history, newest first.

**Done when**: mock paystack payout goes requested→processing with a
`TRF_mock_*` reference and lines reserved; replay returns the same payout;
below-threshold rejected; workflow failure leaves zero payout rows and all
lines `available`; tsc clean.

---

## Task 5 — Transfer webhooks, reconcile, reversals

**Files**: `backend/src/api/hooks/payouts/paystack/route.ts` (new),
`backend/src/api/middlewares.ts` (raw-body config for the hook route),
`backend/src/lib/payments/payouts/reconcile.ts` (new),
`backend/src/api/admin/commissions/reverse/route.ts` (new).

- `POST /hooks/payouts/paystack` — public route (hooks are unauthenticated;
  admin auth does not apply outside `/admin`). `middlewares.ts` adds
  `bodyParser: { preserveRawBody: true }` for the matcher so the HMAC covers
  the exact bytes.
  - Live mode: validate `x-paystack-signature` (HMAC-SHA512 of raw body with
    the secret key, timing-safe — same pattern as the Phase 4 provider);
    invalid → 401, nothing processed.
  - Mock mode: body is trusted as
    `{ event, data: { reference, reason? } }`.
  - `transfer.success` → `markPayoutPaid(reference)`;
    `transfer.failed` → `markPayoutFailed(reference, reason)`;
    `transfer.reversed` → `markPayoutReversed(reference)`; unknown events →
    200 `{ received: true }` (never 500 to the gateway). Reference IS the
    payout id.
- `reconcile.ts` — `reconcilePayouts(container)`: for every `processing`
  payout, poll the rail (`verifyTransfer(payout.id)` /
  `checkWithdrawal(payout.id)`) and apply the same transition methods;
  increments `attempts`; returns `{ checked, paid, failed }`. Payouts that
  stay `processing` are simply retried next run (no time-based failure in
  this phase — provider verdicts only, so replays can never double-pay).
- `POST /admin/commissions/reverse` — body `{ order_id, reason }`; calls
  `reverseCommissionForOrder`; this is the refund/chargeback operational
  entry point (auto-wiring reversals to charge-refund webhooks is a later
  phase; the ledger math is what Phase 5 locks in). `/admin/*` gets Medusa's
  built-in admin auth for free.

**Done when**: mock webhook flips processing→paid (and lines→paid);
`transfer.failed` releases lines; reconcile resolves a processing payout
without a webhook; reversing an unpaid order excludes it from balance;
reversing a paid order creates the offset line; tsc clean.

---

## Task 6 — Scheduling + admin payout APIs

**Files**: `backend/src/jobs/clear-commission-lines.ts` (new),
`backend/src/jobs/scheduled-payouts.ts` (new),
`backend/src/jobs/reconcile-payouts.ts` (new),
`backend/src/lib/payments/payouts/run-scheduled.ts` (new),
`backend/src/api/admin/payouts/route.ts` (new),
`backend/src/api/admin/payouts/run/route.ts` (new),
`backend/src/api/admin/payouts/[id]/reconcile/route.ts` (new).

- Jobs (Medusa file convention: default async fn + `export const config =
  { name, schedule }`), each a thin wrapper over a lib function so tests hit
  the logic directly:
  - `clear-commission-lines` — hourly (`0 * * * *`); always on; calls
    `clearPendingLines()`.
  - `scheduled-payouts` — daily 02:00 (`0 2 * * *`); **no-op unless
    `PAYOUT_SCHEDULE_ENABLED=true`**; calls `runScheduledPayouts(container)`.
  - `reconcile-payouts` — every 15 min (`*/15 * * * *`); no-op unless
    `PAYOUT_SCHEDULE_ENABLED=true`; calls `reconcilePayouts(container)`.
- `run-scheduled.ts` — `runScheduledPayouts(container, sellerId?)`: for each
  seller (or the given one) with a default verified account and available
  balance ≥ threshold, run the create-payout workflow with idempotency key
  `sched-<seller_id>-<YYYYMMDD>` (one scheduled payout per seller per day —
  replaying the cron the same day is a no-op), `requested_by: "schedule"`
  (`"admin"` when invoked from the admin route). Rail = the default account's
  type (bank_account → paystack). Per-seller failures are collected, never
  abort the run.
- Admin routes: `GET /admin/payouts` (all payouts, filter `status`,
  `seller_id`); `POST /admin/payouts/run` body `{ seller_id? }` →
  `runScheduledPayouts` result; `POST /admin/payouts/:id/reconcile` → poll
  that payout's rail now and return the updated payout.

**Done when**: boot log shows the three jobs registered; admin run pays out
an eligible mock seller exactly once per day-key; second run same day
creates nothing; tsc clean.

---

## Task 7 — Live proof (mock mode, dev server)

Reuse the Phase 3/4 live-proof style (Invoke-RestMethod against :9000,
capture exact JSON; log outside `backend/`). All in mock mode:

1. Seller registers a bank payout account → name-resolve returns
   `MOCK ACCOUNT *`, account stored `verified` with `RCP_mock_*`.
2. Checkout → commission line `pending`; `GET /sellers/balance` shows it
   under `pending`; after forcing clearance (env `PAYOUT_CLEARANCE_DAYS=0` or
   admin-triggered clear) it moves to `available`.
3. `POST /sellers/payouts` (paystack) → payout `processing`, `TRF_mock_*`
   reference, lines `reserved`. Replay with the same idempotency key →
   same payout id, still exactly one payout row.
4. Mock webhook `transfer.success` → payout `paid`, lines `paid`, balance
   shows `paid_out`.
5. Crypto: register a base address → `POST /sellers/payouts` (crypto-usdc) →
   processing; `POST /admin/payouts/:id/reconcile` twice → pending then paid.
6. Reversal: `POST /admin/commissions/reverse` on an unpaid order removes it
   from balance; on a paid order creates the `:reversal` offset line.
7. No-regression: Phase 4 checkout (Paystack + crypto deposit with the new
   per-intent correlation), AI routes, and existing seller routes still 200.

Record raw responses in the completion summary. No commit for this task.

---

## Task 8 — Integration tests

**File**: `backend/integration-tests/http/payouts.spec.ts` (new; follow the
payments.spec.ts split: offline deterministic units + one
`medusaIntegrationTestRunner({ inApp: true })` block). Module-top env:
`PAYSTACK_SECRET_KEY=mock`, `CIRCLE_API_KEY=mock`, `CRYPTO_ENABLED=true`,
`PAYOUT_CLEARANCE_DAYS=0`, `PAYOUT_MIN_NGN=1`,
`PAYOUT_SCHEDULE_ENABLED=false`.

Offline units:
- paystack-transfers mock: resolve happy + `"00"` failure; recipient code
  deterministic; transfer verify pending→success; `"fail"` reference →
  failed.
- crypto seam: withdrawal pending→confirmed; `"fail"` address → failed; two
  deposit intents get distinct addresses and do not cross-confirm
  (correlation fix); object-signature `checkSettlement` respects
  `expected_usdc`.

In-app (container + api):
- Seed a seller + commission lines via the marketplace service; clearance
  flips pending→available; `getSellerBalance` sums per status.
- create-payout workflow: reserves lines, creates `processing` payout with
  provider reference; **same idempotency key replayed → same payout id, one
  row**; below-threshold (raise `PAYOUT_MIN_NGN` for the case) → rejected,
  nothing reserved.
- Webhook route: mock `transfer.success` → paid + lines paid;
  `transfer.failed` → failed + lines released to available.
- Reconcile: a processing crypto payout resolves to paid after two polls.
- Reversal: unpaid line reversed drops out of balance; paid line reversal
  writes the offset line and next balance nets down.
- No-regression: `/health` 200; the three payment providers still register
  enabled.

**Done when**: FULL suite green — existing 25 (health 1, marketplace 7,
ai 6, payments 11 — payments updated for the `checkSettlement` signature)
plus the new payouts spec — reported verbatim.

---

## Task 9 — README docs

Append a **## Payouts & Settlement (Phase 5)** section to `backend/README.md`
content used for phase docs (same place the Phase 4 section landed):
- Settlement state machine diagram (pending→available→reserved→paid,
  reversed/clawback) + clearance/threshold env vars.
- Payout lifecycle + idempotency contract; provider reference = payout id.
- Paystack Transfers (name resolve, recipient, webhooks, reconcile) + mock
  mode table.
- Crypto withdrawals via the `CryptoSettlement` seam; the Phase 4
  correlation-gap fix (per-intent wallets + amount matching).
- API table: seller (`balance`, `payout-accounts`, `payouts`) + admin
  (`payouts`, `payouts/run`, `payouts/:id/reconcile`,
  `commissions/reverse`) + `hooks/payouts/paystack`.
- Scheduling: the three jobs, `PAYOUT_SCHEDULE_ENABLED` gate.

---

## Test Plan (aggregate)

- `npx tsc --noEmit` clean after every task.
- Migration applies cleanly; `npm run dev` boots with the three jobs
  registered.
- Live proofs 1–7 captured verbatim in mock mode.
- Full integration suite green (existing 25 + payouts.spec.ts), run via the
  proven Windows procedure (direct path first, subst-X: fallback), reported
  verbatim.
- Working tree committed per task; plan committed first.

## Assumptions

- Payouts sweep the full available balance per currency — partial amounts and
  line-splitting are explicitly out of scope.
- NGN is the only payout currency this phase (threshold env is NGN-major);
  the balance/ledger math is already currency-keyed for later.
- Crypto payout amount uses the fixed `CRYPTO_NGN_PER_USDC` rate — same PoC
  placeholder as Phase 4 deposits.
- Charge-refund webhooks do NOT auto-reverse commissions yet; the admin
  reversal endpoint is the operational path (auto-wiring is additive later).
- Circle SDK remains dynamically imported and optional; every Circle call has
  a deterministic mock twin, so CI/dev never needs keys. If the installed SDK
  surface differs for outbound transfers, the implementer adapts `circle.ts`
  and keeps the `CryptoSettlement` interface stable.
- Per-intent Circle wallets are acceptable at testnet-PoC volume; a pooled
  address-reuse strategy is a later optimization, the seam already hides it.

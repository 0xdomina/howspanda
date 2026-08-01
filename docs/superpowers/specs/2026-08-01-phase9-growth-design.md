# Phase 9 — Referral & Growth Design

> Status: locked for the referral engine; group buy scoped as Task 3.
> Companion plan: `docs/superpowers/plans/2026-08-01-phase9-growth.md`.

## Problem

The marketplace needs organic growth loops. The roadmap: "Referral program
(Airbnb-style, capped): refer a buyer → reward when their first transaction
COMPLETES (escrow released — Phase 6 makes this gate real); refer a seller →
reward on their first completed sale. Both referrer AND referee earn. Caps:
₦1,000,000 lifetime buyer earnings, ₦1,500,000 lifetime seller earnings. Earnings
are withdrawable through the existing payout rails."

## Decisions (locked)

1. **Referrer = seller in v1.** A seller invites a buyer email. The buyer's first
   completed (escrow-released) transaction qualifies the referral and pays the
   referrer. Buyer-referrer rewards + referee rewards need a coupon/credit
   surface (deferred; the Phase 8 buyer-credit note is the same seam).
2. **"Completes" = escrow release.** A referral qualifies when a commission line
   for an order placed by the referee email becomes `available` (Phase 6
   confirm-receipt or sweep). This is the anti-fraud gate the roadmap demands —
   signups and pending orders never pay.
3. **Qualification on read.** `GET /sellers/referrals` first runs
   `qualifyPending(sellerId)`: every `pending` referral is scanned against orders
   for its referee email; on the first order whose line is `available`, the reward
   is written. Idempotent (status flips to `qualified` atomically with the reward
   write) — the trust-score pattern, no new event bus.
4. **Reward = 0% `available` CommissionLine** to the referrer seller, so it flows
   into the existing balance → payout rails (withdrawable, exactly as the roadmap
   wants). Default ₦2,000 per qualified referral; env `REFERRAL_SELLER_REWARD_NGN`.
5. **Lifetime cap per referrer** on paid referral rewards:
   `REFERRAL_SELLER_LIFETIME_CAP_NGN`, default ₦1,500,000 (roadmap). Excess
   referrals stay pending with a documented capped reason.
6. **One referee email per referral; one referral per seller→email pair.**
   A claim binds the advertised email (409 if already bound to a different email).
7. **Anti-abuse:** reward only on completion (lock-in), one code per email pair,
   idempotent qualification. Device fingerprinting (NDPA consent) is explicitly
   NOT in v1 — noted as a later hardening (roadmap).
8. **Group buy (Task 3, scoped):** seller-configured tiered price drops, group
   sessions with share links, N-group composition at checkout. Bigger surface;
   execution follows the referral engine in the same phase.

## Model

`Referral` (`growth` module, table `referral`):
`id`, `code` (unique, `REF-...` unguessable), `referrer_role` (`seller`),
`referrer_seller_id`, `referee_email` (nullable until claimed), `status`
(`pending|qualified`), `reward_amount` (nullable — set when paid),
`currency_code` (default `ngn`), `capped_reason` (nullable),
`qualified_at` (nullable), `paid_commission_line_id` (nullable),
`created_at`/`updated_at`.

## API

| Endpoint | Auth | Purpose |
|---|---|---|
| `POST /sellers/referrals` | seller | Create a referral (referee email) |
| `GET /sellers/referrals` | seller | Auto-qualify pending, list + lifetime earnings |
| `POST /store/referrals` | publishable key | Referee claims a code with their email |

## Trade-offs

- On-read qualification trades a few seconds of scan for zero new event plumbing
  and bulletproof idempotency; reward latency is "by the time the seller looks".
- Seller-side-only v1 keeps the money path on the existing rails; buyer-referrer
  rewards are noted as the same buyer-credit seam Phase 8 already opened.

# Phase 10 — Digital Mall Design

> Status: locked. Companion plan: `docs/superpowers/plans/2026-08-01-phase10-mall.md`.

## Problem

Build a **digital mall** — a gamified, time-boxed marketplace event where sellers co-create
a "mall stand" that doesn't go live until it hits a bonding-curve threshold (5 sellers + 10 buyers).
Sellers fund a **prize pool** (their ad budget + optional redeemable gifts: gift cards, vouchers, tickets).
Buyers who purchase from the mall get **luck-based cash prizes** drawn from the pool.
Malls expire after max 30 days; unfunded malls refund everyone; expired malls return remaining
funds proportionally. Gen Z vibe, meme-coin launch energy, no cheating.

## Decisions (locked)

1. **Bonding-curve launch mechanic.** A mall stays `pending` until it hits both thresholds:
   **5 sellers** joined + **10 buyers** joined. Then it auto-activates to `active`. If it
   never hits both thresholds before expiry, it's `cancelled` and all seller contributions
   are refunded. This creates FOMO and social proof — exactly like a meme-coin bonding curve.

2. **Seller-funded prize pool.** Each seller contributes NGN to the mall's prize pool when
   joining. The pool grows with each new seller (bonding-curve effect: more sellers = bigger
   prizes = more buyer interest). Sellers can also attach **one optional redeemable** (gift
   card, voucher, or ticket) as an extra prize/gift for buyers — specific to their own
   participation, not the whole mall.

3. **Luck-based prize draws, NOT deterministic rev-share.** When a buyer makes a purchase
   in an `active` mall, the system runs a **random draw** to determine if they win a cash
   prize from the pool. The seller configures:
   - `prize_winner_count`: how many buyers will win total (e.g., 3 winners)
   - `prize_distribution`: `equal` (all winners get the same amount) or `random`
     (random amounts up to a cap)
   
   No buyer knows which product/trigger will make them win. It's pure luck — like a
   lottery ticket attached to every purchase. This stays legally distinct from a promotional
   lottery because it's a **purchase-contingent random enhancement**, not a standalone
   chance to win for free.

4. **Prize pool lifecycle.** The pool is funded at seller-join time. Prizes are drawn on
   each qualifying purchase until either:
   - All `prize_winner_count` winners are drawn (mall enters `settling` state), OR
   - The mall expires (30-day max) → remaining pool is refunded proportionally to sellers
     based on their `(contribution_ngn / total_contributed_ngn)` share. No rounding shenanigans.

5. **Buyer wallet (introduced here).** A genuine per-email buyer balance + append-only
   ledger, the payout surface for prizes. v1 supports credit + balance + list.
   **Withdrawal to a real rail is a documented stub** (later phase wires Paystack/Circle
   recipient payouts for buyers, mirroring seller payouts). Prizes are *credited* and
   *withdrawable in accounting*, not faked.

6. **Redeemables as seller gifts.** When a seller joins a mall, they can optionally attach
   one redeemable (gift card, voucher, or ticket) from their store's redeemables inventory.
   This redeemable becomes an **extra prize** that can be awarded alongside cash prizes.
   It's specific to that seller's participation — other sellers' redeemables are separate.

7. **Anti-cheat rules.**
   - One buyer can win only once per mall (tracked by `buyer_email` + `mall_id`).
   - Prize draw happens only on **completed purchases** (escrow released), not pending orders.
   - Seller contributions are held in escrow until mall cancels/expires → no premature spending.
   - All prize draws are logged with `random_seed` for auditability.

8. **Mall expiry.** Every mall has a `expires_at` timestamp (max 30 days from creation).
   A background job (or on-read check) scans for expired malls and triggers refund flows.
   Expired malls that never launched refund proportionally; expired malls that did launch
   refund only the remaining pool after all prizes are drawn.

## Models

- `Mall`: `id`, `name`, `description`, `created_by_seller_id`, `status`
  (`pending|active|settling|expired|cancelled`), `target_sellers` (int, default 5),
  `target_buyers` (int, default 10), `prize_winner_count` (int), `prize_distribution`
  (`equal|random`), `prize_pool_ngn` (bigNumber), `contributed_ngn` (bigNumber),
  `remaining_ngn` (bigNumber), `starts_at`/`ends_at`/`expires_at`, timestamps.
- `MallSeller`: `id`, `mall_id`, `seller_id`, `contribution_ngn` (bigNumber),
  `redeemable_id` (nullable — optional gift attached), `joined_at`.
- `MallBuyer`: `id`, `mall_id`, `buyer_email` (text), `joined_at`, `purchase_count` (int),
  `has_won` (bool, default false), `won_prize_ngn` (bigNumber, nullable), `won_at`
  (nullable).
- `MallPrize`: `id`, `mall_id`, `winner_buyer_email` (text), `amount_ngn` (bigNumber),
  `is_random` (bool), `redeemable_id` (nullable — if prize included a gift), `random_seed`
  (text — for audit), `wallet_ledger_id` (nullable), `claimed` (bool), `claimed_at`
  (nullable), timestamps.
- `Wallet` (buyer-wallet module): `id`, `buyer_email` (unique), `currency_code`,
  `balance` (bigNumber), timestamps.
- `WalletLedger`: `id`, `wallet_id`, `amount` (signed bigNumber), `source`
  (`mall_prize|tip_credit|referral|withdrawal|adjustment`), `reference` (nullable),
  timestamps.

## API

| Endpoint | Auth | Purpose |
|---|---|---|
| `POST /store/malls` | seller | Create a mall (pending) |
| `GET /store/malls` | seller | List own malls (created or joined) |
| `POST /store/malls/:id/join` | seller | Join as seller (contribute + optional redeemable) |
| `GET /store/malls/active` | publishable key | Browse active malls (buyer view) |
| `GET /store/malls/:id` | publishable key | Get mall details (sellers, buyers, prizes) |
| `POST /store/malls/:id/join-buyer` | publishable key | Join as buyer (express interest) |
| `POST /store/malls/:id/purchase` | publishable key | Record purchase (triggers prize draw if active) |
| `POST /admin/malls/:id/go-live` | admin | Force-activate a mall (override thresholds) |

## Trade-offs

- The buyer wallet is real but **withdrawal to a fiat/crypto rail is stubbed in v1**
  (later phase wires Paystack/Circle recipient payouts for buyers, mirroring seller
  payouts). Prizes are credited and balance is honest.
- Random prize draws are logged with `random_seed` for auditability and legal defensibility.
- The bonding-curve mechanic (threshold-based activation) creates organic FOMO without
  requiring complex smart contracts — it's pure application logic.
- Redeemable gifts are tracked per-seller, not per-mall, allowing heterogeneous gift
  mixes (one seller brings gift cards, another brings vouchers, another brings nothing).

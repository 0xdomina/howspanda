# Phase 8 — Two-way Tipping Design

> Status: locked. Companion doc: `docs/superpowers/plans/2026-08-01-phase8-tipping.md`.

## Problem

The marketplace has serious settlement rails (multi-rail payments, commission
ledger, payouts, escrow) but no human layer of appreciation. Sellers want to
reward repeat buyers; buyers want to tip excellent sellers. The roadmap asks for
"Buyer → seller cash tips; seller → buyer cash or extra-product tips ... rides the
existing payment rails + settlement ledger (tips are ledger lines with 0% commission
or a small platform fee — decide then)."

## Decisions (locked)

1. **Direction.** A `Tip` has `direction: "to_seller"` (buyer→seller) or
   `"to_buyer"` (seller→buyer).
2. **Platform commission on tips = 0%.** Tips are gratuities, not sales; the
   platform takes nothing. `CommissionLine.rate = 0`, `commission_amount = 0`,
   `net_amount = tip amount`. (Decision called out by the roadmap — 0% chosen;
   raising it later is a one-line change.)
3. **Settlement = existing ledger, immediate `available`.** A tip does not go
   through the escrow window (there is no goods-delivery gate on a gratuity). It
   is written directly as an `available` `CommissionLine` (Phase 5 state machine),
   so it counts toward the seller's balance and is payable through the existing
   payout rails unchanged. Reversal/clawback (`/admin/commissions/reverse`) stays
   the dispute backstop.
4. **Buyer → seller (`to_seller`).** Buyer proves ownership of the order via email
   (`assertOrderEmail`, Phase 6 pattern) and posts an amount. A `Tip` row + a 0%
   positive `CommissionLine` to the owning seller are created atomically through
   the marketplace split's seller resolution.
5. **Seller → buyer cash (`to_buyer`, cash).** Seller posts an amount
   (≤ their available balance). A `Tip` row + a **negative** 0% `CommissionLine`
   (deducted from the seller's available balance) are created; the buyer's side is
   issued as a **credit note** recorded on the `Tip`
   (`buyer_credit_status: "issued"`, `buyer_credit_code`). A buyer-store-credit
   redemption surface is deferred to a later phase.
6. **Seller → buyer extra-product (`to_buyer`, product).** Seller gifts a product
   from their catalog. **No money moves**; the `Tip` records `product_id` +
   `product_title` (a bonus/perk, like a free upgrade). No `CommissionLine`.
7. **Buyer identity** is the order email (guest-checkout, Phase 6/8 pattern). A
   future buyer-account phase can tighten it.
8. **Payment capture is deferred.** Posting a cash tip credits the ledger
   immediately; actually debiting the buyer's card for a standalone tip is a later
   payments item (consistent with the deferred on-chain crypto refunds already in
   the repo). Documented, not faked.

## Model

`Tip` (`tipping` module, table `tip`):
`id`, `direction` (`to_seller|to_buyer`), `order_id` (nullable source/gift order),
`buyer_email`, `seller_id`, `currency_code` (default `ngn`),
`amount` (bigNumber, nullable — product tips have none),
`product_id`/`product_title` (nullable — extra-product tips),
`note` (nullable), `status` (`available|reversed`, default `available`),
`commission_line_id` (nullable — the marketplace ledger row),
`buyer_credit_status`/`buyer_credit_code` (nullable — recorded for to_buyer cash),
`created_at`/`updated_at`.

## API

| Endpoint | Auth | Purpose |
|---|---|---|
| `POST /store/orders/:id/tip` | publishable key + email | Buyer→seller cash tip (email ownership gate) |
| `GET /sellers/tips` | seller | List tips (in/out) + summary |
| `POST /sellers/tips` | seller | Seller→buyer cash or extra-product tip |

## Trade-offs

- Reuses balances/payouts/reversal instead of a second wallet → less new money
  surface, but a standalone buyer-credit redemption UI is still a future phase.
- Cash tips settle immediately (available) rather than through escrow → no fraud
  gate on buyer→seller, acceptable for gratuities; reversal remains the backstop.

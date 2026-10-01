# Giftcard management — plan (approved direction, not yet built)

## Product decision (locked)

Once a giftcard is created, **its amount is fixed forever**. No top-up, no
reduction, no balance edits by anyone. A card lives exactly one of these
lives: it gets spent down to zero, it expires, or its creator
deletes/revokes it. This doc designs the tooling around that invariant.

## Current state (verified against code)

- Model `backend/src/modules/redeemables/models/redeemable.ts` (verified on
  disk): `type` ∈ gift_card/voucher/ticket/product_gift, `status` ∈
  active/redeemed/cancelled/expired, `face_value` + `balance` (giftcards
  only), `expires_at` (write-once), `issued_to_email`, `source_order_id`,
  soft-delete column present but **never written**.
- Spend: checkout auto-drawdown (`min(balance, total)`, stays `active`
  until zero) and in-store redeem with explicit amount. Every spend writes
  a `redemption` row (receipt) that **no UI or API surfaces**.
- Expiry: lazy only — flips to `expired` when someone tries to use or check
  an expired code. No sweep, no extend, no expire-now.
- Seller UI (`seller-redeemables.tsx`): create, till-redeem, cancel
  (active-only, owner-only). **No delete, no expiry edit, no history.**
- No `DELETE` route; no `softDelete`/`deleteRedeemables` call anywhere in
  `backend/src`. Cancelled rows live forever.

## What we are building

A per-card Manage panel (seller workspace) showing: state badge (Active /
Partially used / Spent / Expired / Cancelled), `X of Y left`, expiry date,
redemption history, and three actions: **Expire now**, **Set/extend/clear
expiry**, **Delete or Revoke**. Plus a redemption-history read API. No
value-changing API exists or will exist.

### Delete vs revoke policy (enforced server-side)

- **Delete** (soft-delete, disappears from lists): allowed only when the
  card never carried buyer money — unissued (`issued_to_email` null,
  `source_order_id` null) AND zero spend (no `redemption` rows). Priced
  templates also unpublish the linked storefront product.
- **Revoke** (= cancel, stays visible as Cancelled): everything else with
  `status = active`. Issued, gifted, purchased, or partially spent cards
  can never be deleted — only revoked, so the audit trail survives.
- `redeemed` / `expired` cards: neither (nothing to take back). UI hides
  both buttons with the reason stated.

### Expiry rules

- `expires_at` set at creation (unchanged). Management adds: extend/change,
  clear (back to no-expiry), and Expire now (active → expired).
- Expired cards keep their history; balance is irrelevant after expiry.

### Display states (derived, no migration)

`redeemed` → Spent. `active` + `balance < face_value` → Partially used.
`active` otherwise → Active. `expired` / `cancelled` pass through.

## Phases

**Phase 0 — display states (no migration, no new writes).**
Derived badges + `X of Y left` progress in seller list and card; history
still hidden. Files: `seller-redeemables.tsx`, `redeemable-card.tsx`,
`lib/data/seller.ts` types.

**Phase 1 — history read API + filters.**
`GET /sellers/redeemables/:id/redemptions` (owner/permission-scoped, newest
first) + wire the existing `?status=` filter into the seller UI + per-card
expandable history. Read-only backend; proves the audit trail before any
destructive action ships.

**Phase 2 — expiry management + delete/revoke (the money-touching writes).**
`POST .../:id/expiry` (set/extend/clear), `POST .../:id/expire-now`,
`DELETE .../:id` implementing the delete-vs-revoke policy above (soft-delete
or cancel + product unpublish for priced templates). UI Manage panel with
confirm copy per policy. No value endpoint. Ever.

**Phase 3 — sweep + hardening.**
Hourly job expiring past-due actives (mirrors `close-bank-transfer-rechecks`
pattern) so Expired reflects reality without a use attempt; integration
tests per transition in `redeemables.spec.ts`.

## Out of scope (deliberate)

Balance adjust / top-up / reduce APIs. Partial-spend stays automatic at
checkout and explicit-amount at the till. `product_gift` internals unchanged.

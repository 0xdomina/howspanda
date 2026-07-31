# Phase 7 Design — Store Identity & Redeemables

**Date**: 2026-07-31
**Status**: Approved (design review with owner, this session)
**Scope**: Backend only (`backend/`), Medusa v2.18, mock-mode-first — same
discipline as Phases 1–6.

## Product context

Every seller gets a real front door — a unique public storefront URL — and a
set of personal, store-scoped instruments: **gift cards**, **vouchers** and
**tickets**. They are customized and specific to one seller's store, and they
must be *extremely easy* to redeem, digitally at checkout or physically when
the buyer walks into the shop/club/event (code + QR). This is the Nigerian
informal-business digitizer: the club ticket, the "I'll pay small now" gift
card, the market discount — all become platform primitives. Phase 10's
location-based campaigns will later issue these same instruments, so the
module is built as a shared primitive with a clean issue API.

## Decisions locked (owner Q&A)

| Question | Decision |
|---|---|
| Money model | **Seller autonomy**: create redeemables and sell them, gift them free, or mix — seller decides per instrument. Always store-scoped. |
| Value mechanics | **Classic semantics**: gift card = stored value drawn down across purchases to ₦0; voucher = one-shot discount (fixed or %); ticket = one-shot admission. |
| Commission point | **At purchase** — a sold gift card/ticket pays the normal commission when money moves; redemption later is just a discount, never double-charged. |
| Escrow fit | **Release immediately** — money from sold gift cards/tickets goes `available` at purchase (no 3-day window). The Phase 5 admin reversal/clawback path remains the dispute backstop. |
| Architecture | **Approach A** — new dedicated `redeemables` module beside `marketplace` and `ai`. |

## 1. Store identity

`GET /store/sellers/:handle` (public, publishable key):

- Resolves the seller's unique `handle` (already unique on the seller model —
  no schema change) to the public profile: `name`, `handle`, `logo`,
  `description`, `verification_status`.
- Includes the seller's published products (via the existing seller-product
  link) and the redeemables currently **listed for sale** (`price` set,
  status `active`, not expired).
- 404 for unknown handles. This endpoint is what the frontend renders at
  `/store/<handle>`.

No storefront customization fields this phase (themes, banners = frontend
phase concern).

## 2. The `redeemables` module

New module at `backend/src/modules/redeemables` (index, service, models,
migrations — same layout as `marketplace`).

### Model: `Redeemable`

| Field | Notes |
|---|---|
| `id` | pk |
| `seller_id` | owning store — every scope check runs against this |
| `type` | `gift_card` \| `voucher` \| `ticket` |
| `code` | unique, unguessable, human-friendly: `GC-`/`VC-`/`TK-` prefix + 12 crypto-random chars in 3 groups (e.g. `GC-7XK2-M9Q4-TR8B`), unambiguous alphabet (no 0/O/1/I) |
| `status` | `active` \| `redeemed` \| `cancelled` \| `expired` |
| `currency_code` | `ngn` default |
| `face_value` | original value (gift cards/tickets); null for vouchers |
| `balance` | remaining value (gift cards; starts = face_value) |
| `discount_type` / `discount_value` | vouchers only: `fixed` \| `percent` + amount |
| `price` | set ⇒ purchasable template (auto-creates a linked product, see §3); null ⇒ gift/free-issue only |
| `expires_at` | optional; expired codes fail validation (status flipped lazily on touch) |
| `issued_to_email` | recipient when gifted directly or minted from a sale |
| `source_order_id` | the order that bought it (null for free issues) |
| `title` | seller-facing label ("VIP Ticket — Friday Night") |

### Model: `Redemption`

| Field | Notes |
|---|---|
| `id`, `redeemable_id` | audit trail row per use |
| `amount_applied` | ₦ drawn (gift card), discount granted (voucher), face_value (ticket) |
| `order_id` | checkout redemptions; null for in-store |
| `channel` | `checkout` \| `in_store` |

### Semantics (service-enforced)

- **Gift card**: redeem any amount ≤ balance; balance depletes; status flips
  to `redeemed` only at ₦0. Multiple redemptions across both channels.
- **Voucher**: exactly one redemption, then `redeemed`. Fixed vouchers apply
  min(discount, order total); percent vouchers apply pct × order total.
- **Ticket**: exactly one redemption (door entry / service), then `redeemed`.
- All redemptions are idempotent-safe: re-redeeming a dead code returns a
  clear MedusaError (NOT_ALLOWED → 400), never a silent success or a 500.
- QR = the code as payload. API responses include `qr_payload` (the code
  string); rendering is frontend work.

## 3. Creation & sale

### Seller creates (`POST /sellers/redeemables`)

Body: `{ type, title, face_value? , discount_type?, discount_value?, price?,
expires_at?, quantity? (default 1, max 100), issued_to_email? }` → mints
`quantity` coded instances. Free issuance moves no money. Validation per
type: gift_card/ticket require `face_value`; voucher requires
`discount_type` + `discount_value`.

### Buyer buys one

Sold redeemables ride the existing rails untouched: the storefront lists them
(§1), the buyer checks out normally (any Phase 4 provider), the normal
commission line is written by `create-seller-orders`. Phase 7 adds:

- A **priced** redeemable is a *template*: creating it also auto-creates a
  linked published product (`metadata.redeemable_template_id`) at that price,
  so it rides normal checkout. A subscriber on order placement detects such
  items and mints a **fresh** coded instance per unit purchased, addressed to
  the buyer's email (`quantity` in the create call applies to free-issuance
  batches only; sold templates mint per purchase until cancelled/expired).
- **Instant escrow release**: if the seller-order contains *only* redeemable
  items, the commission line is released immediately (`available`,
  `available_at = now`) — per the locked decision. Mixed orders (goods +
  redeemables) keep the normal Phase 6 escrow window; simplicity beats
  per-line-item splitting at this stage.
- Refund/dispute of a sold instrument = admin reversal (Phase 5 clawback
  handles the already-released money) + code cancellation.

## 4. Redemption — two doors, one service

### Digital (checkout)

1. `GET /store/redeemables/:code` — public validity check: type, store
   (seller handle), balance/discount, expiry. Unknown/dead codes → 404/400.
2. `POST /store/carts/:id/apply-redeemable { code }` — validates the cart's
   seller matches the code's seller (store-scoped, always), then records the
   code on the cart (`cart.metadata.redeemable_code`). One code per cart
   this phase.
3. The existing `complete-marketplace` flow consumes it: computes
   `amount_applied` per the semantics, reduces what the buyer is charged,
   writes the `Redemption` row, updates balance/status. If the code died
   between apply and complete → checkout fails with a clear 400 (buyer
   removes it and retries).

### Physical (in-store)

`POST /sellers/redeemables/redeem { code, amount? }` — seller-authenticated.
The owning seller (and only them — foreign codes 404) redeems what the buyer
shows on their phone: ticket → door entry, gift card → draws down `amount`
(required for gift cards), voucher → marked used. Response returns the
updated instrument + the redemption row — the seller's screen is the receipt.

## 5. API surface

| Endpoint | Auth | Purpose |
|---|---|---|
| `GET /store/sellers/:handle` | publishable key | Public storefront resolution |
| `GET /store/redeemables/:code` | publishable key | Check a code (validity, balance, store) |
| `POST /store/carts/:id/apply-redeemable` | publishable key | Attach code to cart |
| `GET /sellers/redeemables` | seller | List own instruments (filter type/status) |
| `POST /sellers/redeemables` | seller | Create/mint (sale-listed or free/gifted) |
| `POST /sellers/redeemables/redeem` | seller | Physical in-store redemption |
| `POST /sellers/redeemables/:id/cancel` | seller | Cancel an unredeemed own code |

Zod schemas in `middlewares.ts`, MedusaError → HTTP mapping as established
(NOT_FOUND→404, NOT_ALLOWED→400, CONFLICT→409).

## 6. Security

- Codes are bearer instruments: 12 crypto-random chars ≈ 60+ bits — no
  enumeration risk; the public check endpoint leaks nothing on miss (404).
- Store-scope enforced on every path (apply, complete, in-store, cancel).
- All state transitions are single-row atomic updates; replay of any
  redemption is a 400 with the instrument's current state, never a double
  spend.

## 7. Testing

`integration-tests/http/redeemables.spec.ts` (in-app, mock rails):
storefront handle resolution + 404; free issue + batch mint; voucher
single-use + replay 400; gift card drawdown across two redemptions to ₦0;
ticket redeem + replay; cross-store apply/redeem blocked; expiry blocked;
cancel; checkout apply → complete deducts and records; sold-instrument
commission line born `available`. Full suite (7 spec files) green. Then live
proof on the dev server + README section — same ritual as Phases 4–6.

## Out of scope (recorded, later phases)

- Email/WhatsApp delivery of codes to `issued_to_email` (notification phase).
- QR image rendering, storefront theming (frontend phase).
- Campaign-issued redeemables + location-based campaigns (Phase 10 reuses
  this module's issue API).
- Reviews/ratings + 0–100 store trust score meter (separate subsystem,
  recorded in memory).

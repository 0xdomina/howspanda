# Phase 8 Design — Reviews, Ratings & Trust Score

**Date**: 2026-07-31
**Status**: Approved (design review with owner, this session)
**Scope**: Backend only (`backend/`), Medusa v2.18, mock-mode-first — same
discipline as Phases 1–7.

## Product context

The 0–100 trust score is not a review average — it is the platform's **status
symbol**, the number a Gen-Z seller checks the way they check a follower
count. That framing (owner's north star: identity product, not generic
e-commerce) drives three hard requirements: the score must be
**gaming-resistant** (facts the seller cannot fake outweigh words), **legible**
("why is my score 74?" has a public answer), and **motivating** (named tiers
give the frontend its status language). Reviews are the human voice on top:
one review per real, delivered order — no purchase, no voice.

## Decisions locked (owner Q&A)

| Question | Decision |
|---|---|
| Review target | **Both**: one review per delivered order carrying a store rating (feeds trust score) + optional per-item product ratings (feed product pages later). |
| Score inputs | **Reviews + operational signals**: review quality is the loudest input, blended with delivery/confirmation rates and dispute/reversal history from the Phase 5/6 ledger. |
| Seller recourse | **One public reply per review** — no threads. |
| Score legibility | **Public breakdown**: buyers see the component bars, not just the number. |
| Cold start | **"New" (unrated)** until 5 delivered orders — never a fake-precision 50. |
| Review lifecycle | **7-day edit/delete window** for the buyer + **admin takedown** anytime as the abuse backstop. |
| Review timing | **After delivery** (`delivered_at` set) — not gated on escrow release, so unhappy voices are never delayed. |
| Reviewer display | **Masked name** derived from the order email at read time (e.g. "Chi… O.") — no stored display name, swaps to Telegram usernames later with zero migration. |
| Tiers | **Backend-owned named tiers** on top of the number. |
| Architecture | **Approach B** — dedicated `reviews` module + trust score computed on read (pure function, no stored score, no cron). |

## 1. The `reviews` module

New module at `backend/src/modules/reviews` (index, service, models,
migrations — same layout as `redeemables`). Knows nothing about money; the
ledger stays in `marketplace`.

### Model: `Review`

| Field | Notes |
|---|---|
| `id` | pk |
| `seller_id` | reviewed store — all public listing/scoring scoped by this |
| `order_id` | unique — one review per order, forever (409 on duplicate) |
| `buyer_email` | identity placeholder (Phase 6 pattern); masked at read time, never exposed raw on public surfaces |
| `rating` | integer 1–5 (store rating — the trust score input) |
| `comment` | nullable text, ≤ 2000 chars |
| `status` | `published` \| `removed` |
| `removed_reason` | set on admin takedown |
| `reply_body` / `replied_at` | the seller's single public reply (400 on second attempt) |
| `created_at` / `updated_at` | `created_at` anchors the 7-day edit window |

### Model: `ProductRating`

| Field | Notes |
|---|---|
| `id`, `review_id` | belongsTo Review (cascade with it) |
| `product_id` | the rated item |
| `rating` | integer 1–5 |

Product ratings are stored now and surfaced through one aggregate endpoint;
rich product-page reviews are frontend-phase work.

### Rules (service-enforced)

- Create: rating 1–5 integer; optional comment; optional
  `product_ratings[]` (each product must belong to the reviewed order).
- Edit/delete: buyer only (email match), within
  `REVIEW_EDIT_WINDOW_DAYS` (default 7) of `created_at` — after that 400.
- Reply: owning seller only, exactly once.
- Admin removal: flips `status` to `removed` — the review disappears from
  public lists and from all score math, stays visible to admin.
- `removed` reviews are terminal: no buyer edits, no seller replies.

## 2. Trust score — pure function, computed on read

`getTrustScore(sellerId)` composes review aggregates (reviews module) with
ledger facts (marketplace module) and returns:

```json
{
  "score": 74,
  "tier": "Reliable",
  "review_count": 41,
  "avg_rating": 4.2,
  "breakdown": [
    { "key": "review_quality", "weight": 60, "value": 78 },
    { "key": "fulfillment", "weight": 25, "value": 71 },
    { "key": "dispute_health", "weight": 15, "value": 64 }
  ]
}
```

No stored score, no cron, no staleness — the public breakdown and the meter
can never disagree. If storefront traffic ever demands it, a cached column
can be added later without changing any API shape.

### Components

| Component | Weight | Formula |
|---|---|---|
| `review_quality` | 60% | Bayesian average of published store ratings: `((avg × n) + (3.5 × 5)) / (n + 5)`, rescaled `(x − 1) / 4 × 100`. The 3.5★/weight-5 prior means two friendly 5★ reviews land ≈ 78, not 100. |
| `fulfillment` | 25% | Over the seller's commission lines: 60% delivered-rate + 40% confirmation-rate (`confirmed_at` ÷ delivered). Delivered-rate denominator = lines either already delivered or created more than 14 days ago — fresh in-flight orders never count against the seller. |
| `dispute_health` | 15% | Starts at 100; subtracts scaled penalties for `reversed` lines and return-received/admin-hold incidents as a share of total lines (floor 0). |

`score = round(Σ weight × value)`, clamped 0–100.

### Cold start & tiers

- Fewer than `TRUST_SCORE_MIN_ORDERS` (default 5) delivered orders →
  `score: null`, `tier: "New"`, breakdown still returned (transparency from
  day one).
- Tiers (backend-owned so every surface speaks the same status language):
  `New` (unrated) · `Building` 0–49 · `Rising` 50–69 · `Reliable` 70–84 ·
  `Trusted` 85–94 · `Top Store` 95–100.

## 3. API surface

| Endpoint | Auth | Purpose |
|---|---|---|
| `POST /store/orders/:id/review` | publishable key + order email | Create review (gate: order delivered); body `{ email, rating, comment?, product_ratings?[] }` |
| `POST /store/reviews/:id` | publishable key + email | Edit own review inside the 7-day window |
| `DELETE /store/reviews/:id` | publishable key + email | Delete own review inside the 7-day window |
| `GET /store/sellers/:handle/reviews` | publishable key | Public paginated reviews: masked names, ratings, comments, seller replies |
| `GET /store/products/:id/ratings` | publishable key | Product aggregate `{ average, count }` |
| `GET /sellers/reviews` | seller | Own reviews (filter rating/replied) |
| `POST /sellers/reviews/:id/reply` | seller | The single public reply `{ body }` |
| `GET /sellers/trust-score` | seller | Own score + breakdown (dashboard view) |
| `POST /admin/reviews/:id/remove` | admin | Takedown `{ reason }` — excluded from lists and score |

Plus one extension: **`GET /store/sellers/:handle` (Phase 7 storefront) gains
a `trust` block** — `{ score, tier, review_count, avg_rating, breakdown }` —
the meter lives on the profile page.

Zod schemas in `middlewares.ts`; MedusaError → HTTP mapping as established
(NOT_FOUND→404, NOT_ALLOWED→400, CONFLICT→409, UNAUTHORIZED→401).

## 4. Seams (who reads what)

- **Delivered gate** (route layer, not the module): resolve order → exact
  email match (unknown/foreign order or wrong email → 404, same shape as
  Phase 6 routes) → resolve the order's commission line via
  `marketplace.resolveLinesForOrder` → require `delivered_at` (else 400) →
  `reviews.createReview`.
- **Trust score service** (`src/lib/reviews/trust-score.ts`): the one seam
  that reads both modules — review aggregates from `reviews`, line facts
  from `marketplace`. Pure and fixture-testable.
- **Masking** (`src/lib/reviews/mask-name.ts`): derive display name from the
  email local part at read time; raw emails never leave seller/admin
  surfaces.

## 5. Configuration (`backend/.env`)

| Var | Purpose |
|---|---|
| `REVIEW_EDIT_WINDOW_DAYS` | Buyer edit/delete window after posting (default 7) |
| `TRUST_SCORE_MIN_ORDERS` | Delivered orders required before the score activates (default 5) |

## 6. Abuse resistance

- No purchase, no voice: reviews require a real order in the caller's email,
  delivered — review farming needs real delivered orders, which cost real
  commission.
- Bayesian prior damps small-sample manipulation; volume cannot be faked
  because the operational components come from the money ledger.
- Removed reviews leave the score instantly (computed on read).
- One reply per review kills reply-thread flame wars; admin takedown is the
  final backstop, symmetric with the Phase 5/6 admin dispute tools.

## 7. Testing

`integration-tests/http/reviews.spec.ts` (in-app, mock rails): create on a
delivered order + duplicate 409; undelivered 400; wrong-email 404; edit +
delete inside the window; window-expired 400 (service-level with backdated
`created_at`); product ratings validated against order items; masked names
on public lists; seller reply once + second reply 400; admin takedown hides
from public list and score; trust score pure-function units against fixture
ledgers (unrated below threshold, Bayesian damping, fulfillment and dispute
components, every tier boundary); storefront `trust` block present. Then the
ritual: live proof on the dev server, README Phase 8 section, full suite
green (8 spec files).

## Out of scope (recorded, later phases)

- Buyer identity beyond order-email match — Telegram `initData` auth arrives
  with the frontend phase and replaces the placeholder everywhere at once.
- Review photos/media, helpfulness votes, rich product-page reviews.
- Review-prompt notifications (notification phase).
- Trust-score history/graphs and score-based platform perks (post-frontend).

# Phase 8 — Reviews, Ratings & Trust Score Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A fourth custom module `reviews` (one review per real, delivered
order + optional per-item product ratings) and a 0–100 **trust score** computed
on read — the platform's gaming-resistant, legible, named-tier status symbol.
Reviews are the human voice; the score blends review quality with delivery,
confirmation and dispute facts already sitting in the Phase 5/6 ledger.

**Architecture:** Approach B (locked in the spec). `reviews` owns `Review` +
`ProductRating` and knows nothing about money. The trust score is a **pure
function computed on read** (`src/lib/reviews/trust-score.ts`) — no stored
column, no cron — that reads review aggregates from `reviews` and line facts
from `marketplace`. The delivered-gate and email-ownership checks live in the
route layer (reusing `assertOrderEmail` + `marketplace.resolveLinesForOrder`),
exactly as the Phase 6 buyer routes do.

**Tech Stack:** Medusa v2.18 (modules SDK, query.graph, zod middlewares),
PostgreSQL, Jest via `medusaIntegrationTestRunner`.

**Spec:** `docs/superpowers/specs/2026-07-31-phase8-reviews-trust-design.md`
(all decisions locked there: both review targets, reviews + operational
signals, one seller reply, public breakdown, "New" cold start, 7-day window +
admin takedown, after-delivery timing, masked names, backend-owned tiers,
Approach B).

**Conventions that apply to every task** (established Phases 1–7):
- Backend only, inside `backend/`. Mock mode first.
- MedusaError → HTTP: NOT_FOUND→404, NOT_ALLOWED→400, CONFLICT→409,
  INVALID_DATA→400, UNAUTHORIZED→401.
- `npx tsc --noEmit` clean after every task. One conventional commit per task.
- Jest (PowerShell 5.1):
  `$env:TEST_TYPE='integration:http'; $env:NODE_OPTIONS='--experimental-vm-modules'; $env:DB_HOST='localhost'; $env:DB_PORT='5432'; $env:DB_USERNAME='howsu'; $env:DB_PASSWORD='howsu_dev_password'; npx jest <path> --silent=false --runInBand --forceExit`
- `npx medusa db:generate <module>` can exceed 180s — run in background with
  `Tee-Object` logging (Phase 6/7 lesson).
- Commit the plan itself before Task 1.

## File Structure

```
backend/src/
  modules/reviews/                      ← NEW module (4th custom)
    models/review.ts                    ← Review model
    models/product-rating.ts            ← ProductRating model
    service.ts                          ← create/edit/delete/reply/remove + aggregates
    index.ts                            ← Module(REVIEWS_MODULE, {service})
    migrations/Migration*.ts            ← generated
  lib/reviews/
    trust-score.ts                      ← computeTrustScore (pure) + getTrustScore (I/O)
    mask-name.ts                        ← maskName(email) → "Chi… O."
  api/
    store/orders/[id]/review/route.ts   ← POST create (delivered gate)
    store/reviews/[id]/route.ts         ← POST edit + DELETE (window, email)
    store/sellers/[handle]/reviews/route.ts  ← GET public list (masked)
    store/products/[id]/ratings/route.ts     ← GET aggregate
    store/sellers/[handle]/route.ts     ← MODIFY: add `trust` block
    sellers/reviews/route.ts            ← GET own reviews
    sellers/reviews/[id]/reply/route.ts ← POST single reply
    sellers/trust-score/route.ts        ← GET own score + breakdown
    admin/reviews/[id]/remove/route.ts  ← POST takedown
    middlewares.ts                      ← MODIFY: schemas + matchers
  medusa-config.ts                      ← MODIFY: register reviews module
backend/.env(.template/.test)           ← MODIFY: REVIEW_EDIT_WINDOW_DAYS, TRUST_SCORE_MIN_ORDERS
backend/integration-tests/http/reviews.spec.ts  ← NEW spec
README.md                               ← MODIFY: Phase 8 section
```

---

## Task 1 — Module scaffold: models, service shell, registration, migration

**Files:**
- Create: `backend/src/modules/reviews/models/review.ts`
- Create: `backend/src/modules/reviews/models/product-rating.ts`
- Create: `backend/src/modules/reviews/service.ts`
- Create: `backend/src/modules/reviews/index.ts`
- Modify: `backend/medusa-config.ts`
- Generated: `backend/src/modules/reviews/migrations/Migration*.ts`

- [ ] **Step 1: Write the models**

`backend/src/modules/reviews/models/review.ts`:

```ts
import { model } from "@medusajs/framework/utils"
import ProductRating from "./product-rating"

// One review per real, delivered order (Phase 8). The store `rating` is the
// trust-score input; `comment` is the human voice. `buyer_email` is the Phase 6
// identity placeholder — masked at read time on public surfaces, swapped for
// Telegram usernames in the frontend phase with zero migration.
const Review = model.define("review", {
  id: model.id().primaryKey(),
  seller_id: model.text(),
  order_id: model.text().unique(),
  buyer_email: model.text(),
  rating: model.number(),
  comment: model.text().nullable(),
  status: model.enum(["published", "removed"]).default("published"),
  removed_reason: model.text().nullable(),
  reply_body: model.text().nullable(),
  replied_at: model.dateTime().nullable(),
  product_ratings: model.hasMany(() => ProductRating, {
    mappedBy: "review",
  }),
})

export default Review
```

`backend/src/modules/reviews/models/product-rating.ts`:

```ts
import { model } from "@medusajs/framework/utils"
import Review from "./review"

// Optional per-item rating riding a store review. Surfaced through one
// aggregate endpoint now; rich product-page reviews are frontend-phase work.
const ProductRating = model.define("product_rating", {
  id: model.id().primaryKey(),
  product_id: model.text(),
  rating: model.number(),
  review: model.belongsTo(() => Review, {
    mappedBy: "product_ratings",
  }),
})

export default ProductRating
```

- [ ] **Step 2: Service shell + module index**

`backend/src/modules/reviews/service.ts`:

```ts
import { MedusaService } from "@medusajs/framework/utils"
import Review from "./models/review"
import ProductRating from "./models/product-rating"

class ReviewsModuleService extends MedusaService({
  Review,
  ProductRating,
}) {}

export default ReviewsModuleService
```

`backend/src/modules/reviews/index.ts`:

```ts
import { Module } from "@medusajs/framework/utils"
import ReviewsModuleService from "./service"

export const REVIEWS_MODULE = "reviews"

export default Module(REVIEWS_MODULE, {
  service: ReviewsModuleService,
})
```

- [ ] **Step 3: Register the module** in `backend/medusa-config.ts`, after the
`redeemables` entry (keeps the custom modules grouped):

```ts
    {
      resolve: "./src/modules/redeemables",
    },
    {
      resolve: "./src/modules/reviews",
    },
```

- [ ] **Step 4: Generate the migration** (background, Phase 6/7 lesson — can
exceed 180s):

```powershell
npx medusa db:generate reviews 2>&1 | Tee-Object -FilePath .p8-migration.tmp.txt
```

Then run it: `npx medusa db:migrate`. Confirm `Migration*.ts` exists under
`backend/src/modules/reviews/migrations/`. Delete the temp log.

- [ ] **Step 5:** `npx tsc --noEmit` clean.

- [ ] **Step 6: Commit**

```bash
git add backend/src/modules/reviews backend/medusa-config.ts
git commit -m "feat(reviews): scaffold reviews module (Review + ProductRating models, migration)"
```

---

## Task 2 — Reviews service logic

All create/edit/delete/reply/removal rules and aggregates live on the service
(spec §1 "Rules — service-enforced"). The route layer only handles auth + the
delivered gate.

**Files:**
- Modify: `backend/src/modules/reviews/service.ts`

- [ ] **Step 1: Replace the service shell** with the full logic:

```ts
import { MedusaError, MedusaService } from "@medusajs/framework/utils"
import Review from "./models/review"
import ProductRating from "./models/product-rating"

const DAY_MS = 24 * 60 * 60 * 1000

type CreateReviewInput = {
  seller_id: string
  order_id: string
  buyer_email: string
  rating: number
  comment?: string | null
  product_ratings?: { product_id: string; rating: number }[]
  // product ids the reviewed order actually contains (route resolves these)
  order_product_ids: string[]
}

class ReviewsModuleService extends MedusaService({
  Review,
  ProductRating,
}) {
  private editWindowDays(): number {
    return Number(process.env.REVIEW_EDIT_WINDOW_DAYS ?? 7)
  }

  private assertRating(r: number) {
    if (!Number.isInteger(r) || r < 1 || r > 5) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "Rating must be an integer between 1 and 5"
      )
    }
  }

  private assertComment(comment?: string | null) {
    if (comment && comment.length > 2000) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "Comment must be 2000 characters or fewer"
      )
    }
  }

  // One review per order, forever. Product ratings must belong to the order.
  async createReview(input: CreateReviewInput) {
    this.assertRating(input.rating)
    this.assertComment(input.comment)

    const existing = await this.listReviews({ order_id: input.order_id })
    if (existing.length) {
      throw new MedusaError(
        MedusaError.Types.CONFLICT,
        "This order already has a review"
      )
    }

    const productRatings = input.product_ratings ?? []
    for (const pr of productRatings) {
      this.assertRating(pr.rating)
      if (!input.order_product_ids.includes(pr.product_id)) {
        throw new MedusaError(
          MedusaError.Types.NOT_ALLOWED,
          `Product ${pr.product_id} is not part of this order`
        )
      }
    }

    const [review] = await this.createReviews([
      {
        seller_id: input.seller_id,
        order_id: input.order_id,
        buyer_email: input.buyer_email,
        rating: input.rating,
        comment: input.comment ?? null,
      },
    ])

    if (productRatings.length) {
      await this.createProductRatings(
        productRatings.map((pr) => ({
          review_id: review.id,
          product_id: pr.product_id,
          rating: pr.rating,
        }))
      )
    }

    return await this.retrieveReview(review.id, {
      relations: ["product_ratings"],
    })
  }

  // Buyer-owned, published, inside the window — else the right refusal.
  private async getEditable(id: string, email: string) {
    const review = await this.retrieveReview(id).catch(() => null)
    if (
      !review ||
      review.buyer_email.toLowerCase() !== email.trim().toLowerCase()
    ) {
      // hide existence from non-owners — same shape as order-email checks
      throw new MedusaError(MedusaError.Types.NOT_FOUND, "Review not found")
    }
    if (review.status === "removed") {
      throw new MedusaError(
        MedusaError.Types.NOT_ALLOWED,
        "This review was removed and can no longer be changed"
      )
    }
    const age = Date.now() - new Date(review.created_at).getTime()
    if (age > this.editWindowDays() * DAY_MS) {
      throw new MedusaError(
        MedusaError.Types.NOT_ALLOWED,
        `The ${this.editWindowDays()}-day edit window has closed`
      )
    }
    return review
  }

  async editReview(
    id: string,
    email: string,
    changes: { rating?: number; comment?: string | null }
  ) {
    await this.getEditable(id, email)
    if (changes.rating !== undefined) this.assertRating(changes.rating)
    if (changes.comment !== undefined) this.assertComment(changes.comment)

    const patch: Record<string, unknown> = { id }
    if (changes.rating !== undefined) patch.rating = changes.rating
    if (changes.comment !== undefined) patch.comment = changes.comment
    const [updated] = await this.updateReviews([patch])
    return updated
  }

  async deleteOwnedReview(id: string, email: string) {
    await this.getEditable(id, email)
    await this.deleteReviews([id])
  }

  // Owning seller, exactly once.
  async replyToReview(id: string, sellerId: string, body: string) {
    const review = await this.retrieveReview(id).catch(() => null)
    if (!review || review.seller_id !== sellerId) {
      throw new MedusaError(MedusaError.Types.NOT_FOUND, "Review not found")
    }
    if (review.status === "removed") {
      throw new MedusaError(
        MedusaError.Types.NOT_ALLOWED,
        "This review was removed"
      )
    }
    if (review.reply_body) {
      throw new MedusaError(
        MedusaError.Types.NOT_ALLOWED,
        "You have already replied to this review"
      )
    }
    const [updated] = await this.updateReviews([
      { id, reply_body: body, replied_at: new Date() },
    ])
    return updated
  }

  // Admin takedown — terminal; leaves public lists and the score instantly.
  async removeReview(id: string, reason: string) {
    const review = await this.retrieveReview(id).catch(() => null)
    if (!review) {
      throw new MedusaError(MedusaError.Types.NOT_FOUND, "Review not found")
    }
    const [updated] = await this.updateReviews([
      { id, status: "removed", removed_reason: reason },
    ])
    return updated
  }

  // Product-page aggregate — only ratings on still-published reviews count.
  async getProductRatingAggregate(productId: string) {
    const ratings = await this.listProductRatings(
      { product_id: productId },
      { relations: ["review"], take: null }
    )
    const live = ratings.filter((r) => r.review?.status === "published")
    const count = live.length
    const average = count
      ? Math.round((live.reduce((a, r) => a + r.rating, 0) / count) * 10) / 10
      : 0
    return { average, count }
  }
}

export default ReviewsModuleService
```

- [ ] **Step 2:** `npx tsc --noEmit` clean.

- [ ] **Step 3: Commit**

```bash
git add backend/src/modules/reviews/service.ts
git commit -m "feat(reviews): review lifecycle service (create, edit/delete window, reply, admin removal, product aggregate)"
```

---

## Task 3 — Trust score (pure) + name masking libs

The one seam that reads both modules, plus the read-time masking helper. The
pure `computeTrustScore` is fixture-testable with no container (spec §2, §4).

**Files:**
- Create: `backend/src/lib/reviews/trust-score.ts`
- Create: `backend/src/lib/reviews/mask-name.ts`

- [ ] **Step 1: `backend/src/lib/reviews/mask-name.ts`**

```ts
// Privacy-preserving display name from the order email, at read time. Raw
// emails never leave seller/admin surfaces.
//   "chidi.okafor@gmail.com" → "Chi… O."   "bob@x.com" → "Bob"
export function maskName(email: string): string {
  const local = (email.split("@")[0] || "").replace(/[._+-]+/g, " ").trim()
  if (!local) return "Anonymous"
  const cap = (s: string) =>
    s.charAt(0).toUpperCase() + s.slice(1).toLowerCase()
  const parts = local.split(/\s+/).filter(Boolean)
  const first =
    parts[0].length > 3 ? `${cap(parts[0].slice(0, 3))}…` : cap(parts[0])
  if (parts.length > 1 && parts[1]) {
    return `${first} ${parts[1][0].toUpperCase()}.`
  }
  return first
}
```

- [ ] **Step 2: `backend/src/lib/reviews/trust-score.ts`**

```ts
import { MedusaContainer } from "@medusajs/framework/types"
import { MARKETPLACE_MODULE } from "../../modules/marketplace"
import type MarketplaceModuleService from "../../modules/marketplace/service"
import { REVIEWS_MODULE } from "../../modules/reviews"
import type ReviewsModuleService from "../../modules/reviews/service"

const DAY_MS = 24 * 60 * 60 * 1000
const DELIVERABLE_AGE_DAYS = 14

export type TrustBreakdown = {
  key: "review_quality" | "fulfillment" | "dispute_health"
  weight: number
  value: number
}

export type TrustScoreResult = {
  score: number | null
  tier: string
  review_count: number
  avg_rating: number
  breakdown: TrustBreakdown[]
}

// A single commission line reduced to the facts the score cares about.
export type LineFact = {
  status: string
  delivered_at: Date | string | null
  confirmed_at: Date | string | null
  held_at: Date | string | null
  created_at: Date | string
}

export function tierFor(score: number | null): string {
  if (score === null) return "New"
  if (score >= 95) return "Top Store"
  if (score >= 85) return "Trusted"
  if (score >= 70) return "Reliable"
  if (score >= 50) return "Rising"
  return "Building"
}

const clamp = (n: number) => Math.max(0, Math.min(100, n))
const round1 = (n: number) => Math.round(n * 10) / 10

// Pure: no container, no I/O — feed it ratings + line facts and it scores.
export function computeTrustScore(input: {
  ratings: number[]
  lines: LineFact[]
  minOrders: number
  now?: Date
}): TrustScoreResult {
  const now = input.now ?? new Date()
  const { ratings, lines, minOrders } = input

  // review_quality — Bayesian average (prior 3.5★, weight 5) rescaled to 0–100
  const n = ratings.length
  const avg = n ? ratings.reduce((a, b) => a + b, 0) / n : 0
  const bayes = (avg * n + 3.5 * 5) / (n + 5)
  const reviewQuality = clamp(((bayes - 1) / 4) * 100)

  // fulfillment — 60% delivered-rate + 40% confirmation-rate
  const deliveredCount = lines.filter((l) => l.delivered_at).length
  const deliverable = lines.filter(
    (l) =>
      l.delivered_at ||
      now.getTime() - new Date(l.created_at).getTime() >
        DELIVERABLE_AGE_DAYS * DAY_MS
  ).length
  const deliveredRate = deliverable ? deliveredCount / deliverable : 1
  const confirmedRate = deliveredCount
    ? lines.filter((l) => l.confirmed_at).length / deliveredCount
    : 1
  const fulfillment = clamp((0.6 * deliveredRate + 0.4 * confirmedRate) * 100)

  // dispute_health — starts 100, scaled penalties for reversals + holds
  const total = lines.length
  const reversed = lines.filter((l) => l.status === "reversed").length
  const holds = lines.filter((l) => l.held_at).length
  const disputeHealth = total
    ? clamp(100 - (reversed / total) * 100 - (holds / total) * 50)
    : 100

  const breakdown: TrustBreakdown[] = [
    { key: "review_quality", weight: 60, value: Math.round(reviewQuality) },
    { key: "fulfillment", weight: 25, value: Math.round(fulfillment) },
    { key: "dispute_health", weight: 15, value: Math.round(disputeHealth) },
  ]

  const avgRating = n ? round1(avg) : 0

  // Cold start: never a fake-precision score below the threshold
  if (deliveredCount < minOrders) {
    return {
      score: null,
      tier: "New",
      review_count: n,
      avg_rating: avgRating,
      breakdown,
    }
  }

  // Score reconciles with the visible bars: Σ (weight/100 × value)
  const score = clamp(
    Math.round(
      breakdown.reduce((sum, b) => sum + (b.weight / 100) * b.value, 0)
    )
  )
  return {
    score,
    tier: tierFor(score),
    review_count: n,
    avg_rating: avgRating,
    breakdown,
  }
}

// I/O wrapper: gather this seller's published ratings + ledger lines, then score.
export async function getTrustScore(
  container: MedusaContainer,
  sellerId: string
): Promise<TrustScoreResult> {
  const reviews = container.resolve<ReviewsModuleService>(REVIEWS_MODULE)
  const marketplace =
    container.resolve<MarketplaceModuleService>(MARKETPLACE_MODULE)

  const published = await reviews.listReviews(
    { seller_id: sellerId, status: "published" },
    { take: null }
  )
  const lines = await marketplace.listCommissionLines(
    { seller_id: sellerId },
    { take: null }
  )

  return computeTrustScore({
    ratings: published.map((r) => r.rating),
    lines: lines.map((l) => ({
      status: l.status,
      delivered_at: l.delivered_at,
      confirmed_at: l.confirmed_at,
      held_at: l.held_at,
      created_at: l.created_at,
    })),
    minOrders: Number(process.env.TRUST_SCORE_MIN_ORDERS ?? 5),
  })
}
```

- [ ] **Step 3:** `npx tsc --noEmit` clean.

- [ ] **Step 4: Commit**

```bash
git add backend/src/lib/reviews
git commit -m "feat(reviews): trust-score pure function + name masking libs"
```

---

## Task 4 — Store review APIs (create / edit / delete) + schemas

**Files:**
- Create: `backend/src/api/store/orders/[id]/review/route.ts`
- Create: `backend/src/api/store/reviews/[id]/route.ts`
- Modify: `backend/src/api/middlewares.ts`

- [ ] **Step 1: Add schemas** to `middlewares.ts` after
`PostApplyRedeemableSchema` (line ~99):

```ts
// Reviews (Phase 8): email is the ownership proof (Phase 6 pattern)
export const PostCreateReviewSchema = z.object({
  email: z.string().email(),
  rating: z.number().int().min(1).max(5),
  comment: z.string().max(2000).optional(),
  product_ratings: z
    .array(
      z.object({
        product_id: z.string().min(1),
        rating: z.number().int().min(1).max(5),
      })
    )
    .optional(),
})

export const PostEditReviewSchema = z
  .object({
    email: z.string().email(),
    rating: z.number().int().min(1).max(5).optional(),
    comment: z.string().max(2000).nullable().optional(),
  })
  .refine((b) => b.rating !== undefined || b.comment !== undefined, {
    message: "Provide a new rating or comment",
  })

export const DeleteReviewSchema = z.object({
  email: z.string().email(),
})

export const PostReviewReplySchema = z.object({
  body: z.string().min(1).max(2000),
})

export const PostRemoveReviewSchema = z.object({
  reason: z.string().min(3),
})
```

- [ ] **Step 2: Add matchers** inside `defineMiddlewares` `routes`, before the
paystack hooks entry:

```ts
    {
      matcher: "/store/orders/:id/review",
      methods: ["POST"],
      middlewares: [validateAndTransformBody(PostCreateReviewSchema)],
    },
    {
      matcher: "/store/reviews/:id",
      methods: ["POST"],
      middlewares: [validateAndTransformBody(PostEditReviewSchema)],
    },
    {
      matcher: "/store/reviews/:id",
      methods: ["DELETE"],
      middlewares: [validateAndTransformBody(DeleteReviewSchema)],
    },
    {
      matcher: "/sellers/reviews/:id/reply",
      methods: ["POST"],
      middlewares: [validateAndTransformBody(PostReviewReplySchema)],
    },
    {
      matcher: "/admin/reviews/:id/remove",
      methods: ["POST"],
      middlewares: [validateAndTransformBody(PostRemoveReviewSchema)],
    },
```

- [ ] **Step 3: `backend/src/api/store/orders/[id]/review/route.ts`**

```ts
import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import {
  ContainerRegistrationKeys,
  MedusaError,
} from "@medusajs/framework/utils"
import { z } from "@medusajs/framework/zod"
import { assertOrderEmail } from "../../../../../lib/escrow/order-access"
import { MARKETPLACE_MODULE } from "../../../../../modules/marketplace"
import type MarketplaceModuleService from "../../../../../modules/marketplace/service"
import { REVIEWS_MODULE } from "../../../../../modules/reviews"
import type ReviewsModuleService from "../../../../../modules/reviews/service"
import { PostCreateReviewSchema } from "../../../../middlewares"

type Body = z.infer<typeof PostCreateReviewSchema>

// One review per delivered order. Ownership = order id + exact email; the
// delivered gate reads the commission line (Phase 6 rails).
export const POST = async (
  req: MedusaRequest<Body>,
  res: MedusaResponse
) => {
  const orderId = req.params.id
  const { email, rating, comment, product_ratings } = req.validatedBody

  await assertOrderEmail(req.scope, orderId, email)

  const marketplace =
    req.scope.resolve<MarketplaceModuleService>(MARKETPLACE_MODULE)
  const lines = await marketplace.resolveLinesForOrder(orderId)
  if (!lines.length || !lines.some((l) => l.delivered_at)) {
    throw new MedusaError(
      MedusaError.Types.NOT_ALLOWED,
      "You can review an order once it has been delivered"
    )
  }

  // product_ratings must belong to this order — resolve its items
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const { data: [order] } = await query.graph({
    entity: "order",
    fields: ["id", "items.product_id"],
    filters: { id: orderId },
  })
  const orderProductIds = (order?.items ?? [])
    .map((i: { product_id?: string }) => i.product_id)
    .filter(Boolean) as string[]

  const reviews = req.scope.resolve<ReviewsModuleService>(REVIEWS_MODULE)
  const review = await reviews.createReview({
    seller_id: lines[0].seller_id as string,
    order_id: orderId,
    buyer_email: email,
    rating,
    comment,
    product_ratings,
    order_product_ids: orderProductIds,
  })

  res.status(201).json({ review })
}
```

- [ ] **Step 4: `backend/src/api/store/reviews/[id]/route.ts`**

```ts
import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { z } from "@medusajs/framework/zod"
import { REVIEWS_MODULE } from "../../../../modules/reviews"
import type ReviewsModuleService from "../../../../modules/reviews/service"
import {
  DeleteReviewSchema,
  PostEditReviewSchema,
} from "../../../middlewares"

type EditBody = z.infer<typeof PostEditReviewSchema>
type DeleteBody = z.infer<typeof DeleteReviewSchema>

// Buyer edits inside the window (email = ownership proof).
export const POST = async (
  req: MedusaRequest<EditBody>,
  res: MedusaResponse
) => {
  const { email, rating, comment } = req.validatedBody
  const reviews = req.scope.resolve<ReviewsModuleService>(REVIEWS_MODULE)
  const review = await reviews.editReview(req.params.id, email, {
    rating,
    comment,
  })
  res.json({ review })
}

export const DELETE = async (
  req: MedusaRequest<DeleteBody>,
  res: MedusaResponse
) => {
  const { email } = req.validatedBody
  const reviews = req.scope.resolve<ReviewsModuleService>(REVIEWS_MODULE)
  await reviews.deleteOwnedReview(req.params.id, email)
  res.json({ id: req.params.id, deleted: true })
}
```

- [ ] **Step 5:** `npx tsc --noEmit` clean.

- [ ] **Step 6: Commit**

```bash
git add backend/src/api/store/orders backend/src/api/store/reviews backend/src/api/middlewares.ts
git commit -m "feat(reviews): store create/edit/delete review endpoints with delivered gate"
```

---

## Task 5 — Store public reads + storefront trust block

**Files:**
- Create: `backend/src/api/store/sellers/[handle]/reviews/route.ts`
- Create: `backend/src/api/store/products/[id]/ratings/route.ts`
- Modify: `backend/src/api/store/sellers/[handle]/route.ts`

- [ ] **Step 1: `backend/src/api/store/sellers/[handle]/reviews/route.ts`** —
public paginated list, masked names, published only:

```ts
import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import {
  ContainerRegistrationKeys,
  MedusaError,
} from "@medusajs/framework/utils"
import { maskName } from "../../../../../lib/reviews/mask-name"
import { REVIEWS_MODULE } from "../../../../../modules/reviews"
import type ReviewsModuleService from "../../../../../modules/reviews/service"

export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const { data: [seller] } = await query.graph({
    entity: "seller",
    fields: ["id"],
    filters: { handle: req.params.handle },
  })
  if (!seller) {
    throw new MedusaError(MedusaError.Types.NOT_FOUND, "Store not found")
  }

  const limit = Math.min(Number(req.query.limit ?? 20), 100)
  const offset = Number(req.query.offset ?? 0)

  const reviews = req.scope.resolve<ReviewsModuleService>(REVIEWS_MODULE)
  const [items, count] = await reviews.listAndCountReviews(
    { seller_id: seller.id, status: "published" },
    { order: { created_at: "DESC" }, take: limit, skip: offset }
  )

  res.json({
    reviews: items.map((r) => ({
      id: r.id,
      name: maskName(r.buyer_email),
      rating: r.rating,
      comment: r.comment,
      reply_body: r.reply_body,
      replied_at: r.replied_at,
      created_at: r.created_at,
    })),
    count,
    limit,
    offset,
  })
}
```

- [ ] **Step 2: `backend/src/api/store/products/[id]/ratings/route.ts`**

```ts
import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { REVIEWS_MODULE } from "../../../../../modules/reviews"
import type ReviewsModuleService from "../../../../../modules/reviews/service"

export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
  const reviews = req.scope.resolve<ReviewsModuleService>(REVIEWS_MODULE)
  const aggregate = await reviews.getProductRatingAggregate(req.params.id)
  res.json(aggregate)
}
```

- [ ] **Step 3: Extend the storefront profile** — add the `trust` block to
`backend/src/api/store/sellers/[handle]/route.ts`. After the `redeemablesModule`
resolution, import and call `getTrustScore`, then add `trust` to the response:

Add the import at the top:

```ts
import { getTrustScore } from "../../../../lib/reviews/trust-score"
```

Compute after `forSale` is built (needs `seller.id`):

```ts
  const trust = await getTrustScore(req.scope, seller.id)
```

Add to the `res.json({...})` object (alongside `redeemables: forSale`):

```ts
    redeemables: forSale,
    trust,
```

- [ ] **Step 4:** `npx tsc --noEmit` clean.

- [ ] **Step 5: Commit**

```bash
git add backend/src/api/store/sellers backend/src/api/store/products
git commit -m "feat(reviews): public seller reviews list, product rating aggregate, storefront trust block"
```

---

## Task 6 — Seller APIs + admin takedown

`/sellers/*` is already gated by the `authenticate("seller", …)` matcher; the
handlers reuse the `resolveSellerId(req)` pattern (copy the helper from
`sellers/redeemables/route.ts`). `/admin/*` uses default admin auth; the admin
route is a thin wrapper (service-tested).

**Files:**
- Create: `backend/src/api/sellers/reviews/route.ts`
- Create: `backend/src/api/sellers/reviews/[id]/reply/route.ts`
- Create: `backend/src/api/sellers/trust-score/route.ts`
- Create: `backend/src/api/admin/reviews/[id]/remove/route.ts`

- [ ] **Step 1: A shared seller-id helper.** Create
`backend/src/lib/reviews/resolve-seller.ts` (so the three seller routes don't
each redeclare it):

```ts
import { AuthenticatedMedusaRequest } from "@medusajs/framework/http"
import {
  ContainerRegistrationKeys,
  MedusaError,
} from "@medusajs/framework/utils"

export async function resolveSellerId(
  req: AuthenticatedMedusaRequest
): Promise<string> {
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const { data: [sellerAdmin] } = await query.graph({
    entity: "seller_admin",
    fields: ["id", "seller.id"],
    filters: { id: [req.auth_context.actor_id] },
  })
  if (!sellerAdmin?.seller?.id) {
    throw new MedusaError(
      MedusaError.Types.UNAUTHORIZED,
      "Seller not found for authenticated actor"
    )
  }
  return sellerAdmin.seller.id
}
```

- [ ] **Step 2: `backend/src/api/sellers/reviews/route.ts`** — own reviews,
optional `rating` / `replied` filters (seller sees raw email — their surface):

```ts
import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { REVIEWS_MODULE } from "../../../modules/reviews"
import type ReviewsModuleService from "../../../modules/reviews/service"
import { resolveSellerId } from "../../../lib/reviews/resolve-seller"

export const GET = async (
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) => {
  const sellerId = await resolveSellerId(req)
  const reviews = req.scope.resolve<ReviewsModuleService>(REVIEWS_MODULE)

  const filters: Record<string, unknown> = { seller_id: sellerId }
  if (typeof req.query.rating === "string") {
    filters.rating = Number(req.query.rating)
  }
  if (req.query.replied === "true") filters.reply_body = { $ne: null }
  if (req.query.replied === "false") filters.reply_body = null

  const items = await reviews.listReviews(filters, {
    order: { created_at: "DESC" },
  })
  res.json({ reviews: items })
}
```

- [ ] **Step 3: `backend/src/api/sellers/reviews/[id]/reply/route.ts`**

```ts
import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { z } from "@medusajs/framework/zod"
import { REVIEWS_MODULE } from "../../../../../modules/reviews"
import type ReviewsModuleService from "../../../../../modules/reviews/service"
import { resolveSellerId } from "../../../../../lib/reviews/resolve-seller"
import { PostReviewReplySchema } from "../../../../middlewares"

type Body = z.infer<typeof PostReviewReplySchema>

export const POST = async (
  req: AuthenticatedMedusaRequest<Body>,
  res: MedusaResponse
) => {
  const sellerId = await resolveSellerId(req)
  const reviews = req.scope.resolve<ReviewsModuleService>(REVIEWS_MODULE)
  const review = await reviews.replyToReview(
    req.params.id,
    sellerId,
    req.validatedBody.body
  )
  res.json({ review })
}
```

- [ ] **Step 4: `backend/src/api/sellers/trust-score/route.ts`**

```ts
import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { getTrustScore } from "../../../lib/reviews/trust-score"
import { resolveSellerId } from "../../../lib/reviews/resolve-seller"

export const GET = async (
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) => {
  const sellerId = await resolveSellerId(req)
  const trust = await getTrustScore(req.scope, sellerId)
  res.json(trust)
}
```

- [ ] **Step 5: `backend/src/api/admin/reviews/[id]/remove/route.ts`**

```ts
import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { z } from "@medusajs/framework/zod"
import { REVIEWS_MODULE } from "../../../../../modules/reviews"
import type ReviewsModuleService from "../../../../../modules/reviews/service"
import { PostRemoveReviewSchema } from "../../../../middlewares"

type Body = z.infer<typeof PostRemoveReviewSchema>

export const POST = async (
  req: AuthenticatedMedusaRequest<Body>,
  res: MedusaResponse
) => {
  const reviews = req.scope.resolve<ReviewsModuleService>(REVIEWS_MODULE)
  const review = await reviews.removeReview(
    req.params.id,
    req.validatedBody.reason
  )
  res.json({ review })
}
```

- [ ] **Step 6:** `npx tsc --noEmit` clean.

- [ ] **Step 7: Commit**

```bash
git add backend/src/api/sellers/reviews backend/src/api/sellers/trust-score backend/src/api/admin/reviews backend/src/lib/reviews/resolve-seller.ts
git commit -m "feat(reviews): seller reviews list/reply/trust-score endpoints + admin takedown"
```

---

## Task 7 — Integration spec

**Files:**
- Create: `backend/integration-tests/http/reviews.spec.ts`

Reuse the `redeemables.spec.ts` scaffold (onboard seller over HTTP, mint a
publishable key, snapshot in `beforeAll`) and the `escrow.spec.ts` `seedOrder`
helper (createOrders + LINK order↔seller + `marketplace.createCommissionLines`).
A delivered order = a seeded order whose commission line has `delivered_at` set.

> **Source of truth for the order↔seller link + `createCommissionLines`
> payload:** copy `escrow.spec.ts`'s existing `seedOrder` helper **verbatim**
> and only add the `delivered_at` / `confirmed_at` fields. Do not hand-write the
> link shape — the sketch below shows intent, not the exact link keys.

- [ ] **Step 1: Write the spec.** Structure (pure trust-score/mask units first,
then the HTTP lifecycle):

```ts
import {
  ContainerRegistrationKeys,
  Modules,
} from "@medusajs/framework/utils"
import { MARKETPLACE_MODULE } from "../../src/modules/marketplace"
import MarketplaceModuleService from "../../src/modules/marketplace/service"
import { REVIEWS_MODULE } from "../../src/modules/reviews"
import ReviewsModuleService from "../../src/modules/reviews/service"
import { computeTrustScore, tierFor } from "../../src/lib/reviews/trust-score"
import { maskName } from "../../src/lib/reviews/mask-name"

jest.setTimeout(120 * 1000)

process.env.PAYSTACK_SECRET_KEY = "mock"
process.env.REVIEW_EDIT_WINDOW_DAYS = "7"
process.env.TRUST_SCORE_MIN_ORDERS = "5"

const DAY_MS = 24 * 60 * 60 * 1000

medusaIntegrationTestRunner({
  inApp: true,
  env: {},
  testSuite: ({ api, getContainer, dbUtils }) => {
    describe("Reviews, ratings & trust score", () => {
      let reviews: ReviewsModuleService
      let marketplace: MarketplaceModuleService
      let token: string
      let sellerId: string
      let productId: string
      let storeHeaders: { headers: Record<string, string> }
      const auth = () => ({ headers: { Authorization: `Bearer ${token}` } })

      // Seed a seller order + commission line. delivered/confirmed set the
      // corresponding timestamps. USE escrow.spec.ts's link shape verbatim.
      const seedOrder = async (opts: {
        email: string
        delivered?: boolean
        confirmed?: boolean
      }) => {
        /* copy escrow.spec.ts seedOrder, then set on the commission line:
           delivered_at: opts.delivered ? new Date() : null,
           confirmed_at: opts.confirmed ? new Date() : null  */
      }

      beforeAll(async () => {
        const container = getContainer()
        marketplace = container.resolve(MARKETPLACE_MODULE)
        reviews = container.resolve(REVIEWS_MODULE)

        const register = await api.post("/auth/seller/emailpass/register", {
          email: "reviews-seller@howsu.local",
          password: "supersecret",
        })
        const created = await api.post(
          "/sellers",
          {
            name: "Reviews Seller",
            handle: "reviews-seller",
            admin: {
              email: "reviews-seller@howsu.local",
              first_name: "Rev",
              last_name: "Seller",
            },
          },
          { headers: { Authorization: `Bearer ${register.data.token}` } }
        )
        sellerId = created.data.seller.id

        const login = await api.post("/auth/seller/emailpass", {
          email: "reviews-seller@howsu.local",
          password: "supersecret",
        })
        token = login.data.token

        const apiKeyModule = container.resolve(Modules.API_KEY)
        const [pubKey] = await apiKeyModule.createApiKeys([
          { title: "reviews-spec", type: "publishable", created_by: "spec" },
        ])
        storeHeaders = { headers: { "x-publishable-api-key": pubKey.token } }

        const productModule = container.resolve(Modules.PRODUCT)
        const [product] = await productModule.createProducts([
          { title: "Reviewable Product", status: "published" },
        ])
        productId = product.id
        const link = container.resolve(ContainerRegistrationKeys.LINK)
        await link.create([
          {
            [MARKETPLACE_MODULE]: { seller_id: sellerId },
            [Modules.PRODUCT]: { product_id: productId },
          },
        ])

        await dbUtils.snapshot()
      })

      // ---- pure trust-score units (no HTTP) ------------------------------
      it("trust score: unrated below the delivered-order threshold", () => {
        const r = computeTrustScore({ ratings: [], lines: [], minOrders: 5 })
        expect(r.score).toBeNull()
        expect(r.tier).toEqual("New")
        expect(r.breakdown).toHaveLength(3)
      })

      it("trust score: Bayesian prior damps a tiny 5★ sample", () => {
        const lines = Array.from({ length: 6 }, () => ({
          status: "available",
          delivered_at: new Date(),
          confirmed_at: new Date(),
          held_at: null,
          created_at: new Date(),
        }))
        const r = computeTrustScore({ ratings: [5, 5], lines, minOrders: 5 })
        const rq = r.breakdown.find((b) => b.key === "review_quality")!
        expect(rq.value).toBeLessThan(85) // two 5★ ≈ 78, not 100
      })

      it("trust score: reversals and holds erode dispute_health", () => {
        const base = { delivered_at: new Date(), confirmed_at: new Date(), created_at: new Date() }
        const lines = [
          { ...base, status: "available", held_at: null },
          { ...base, status: "reversed", held_at: null },
          { ...base, status: "pending", held_at: new Date() },
          { ...base, status: "available", held_at: null },
          { ...base, status: "available", held_at: null },
          { ...base, status: "available", held_at: null },
        ]
        const r = computeTrustScore({ ratings: [4, 4, 4, 4, 4], lines, minOrders: 5 })
        const dh = r.breakdown.find((b) => b.key === "dispute_health")!
        expect(dh.value).toBeLessThan(100)
      })

      it("trust score: fresh in-flight orders never count against delivered-rate", () => {
        const fresh = {
          status: "pending",
          delivered_at: null,
          confirmed_at: null,
          held_at: null,
          created_at: new Date(),
        }
        const delivered = Array.from({ length: 5 }, () => ({
          status: "available",
          delivered_at: new Date(),
          confirmed_at: new Date(),
          held_at: null,
          created_at: new Date(Date.now() - 20 * DAY_MS),
        }))
        const r = computeTrustScore({ ratings: [5, 5, 5, 5, 5], lines: [...delivered, fresh], minOrders: 5 })
        const f = r.breakdown.find((b) => b.key === "fulfillment")!
        expect(f.value).toEqual(100) // fresh line excluded from the denominator
      })

      it("tierFor covers every boundary", () => {
        expect(tierFor(null)).toEqual("New")
        expect(tierFor(0)).toEqual("Building")
        expect(tierFor(49)).toEqual("Building")
        expect(tierFor(50)).toEqual("Rising")
        expect(tierFor(69)).toEqual("Rising")
        expect(tierFor(70)).toEqual("Reliable")
        expect(tierFor(84)).toEqual("Reliable")
        expect(tierFor(85)).toEqual("Trusted")
        expect(tierFor(94)).toEqual("Trusted")
        expect(tierFor(95)).toEqual("Top Store")
        expect(tierFor(100)).toEqual("Top Store")
      })

      it("maskName derives a privacy-preserving display name", () => {
        expect(maskName("chidi.okafor@gmail.com")).toEqual("Chi… O.")
        expect(maskName("bob@x.com")).toEqual("Bob")
      })

      // ---- HTTP lifecycle -------------------------------------------------
      it("creates a review on a delivered order; rejects a second (409)", async () => {
        const order = await seedOrder({ email: "buyer1@howsu.local", delivered: true })
        const first = await api.post(
          `/store/orders/${order.id}/review`,
          { email: "buyer1@howsu.local", rating: 5, comment: "Fast!" },
          storeHeaders
        )
        expect(first.status).toEqual(201)
        expect(first.data.review.rating).toEqual(5)

        const dup = await api
          .post(
            `/store/orders/${order.id}/review`,
            { email: "buyer1@howsu.local", rating: 4 },
            storeHeaders
          )
          .catch((e) => e.response)
        expect(dup.status).toEqual(409)
      })

      it("rejects a review on an undelivered order (400)", async () => {
        const order = await seedOrder({ email: "buyer2@howsu.local", delivered: false })
        const res = await api
          .post(
            `/store/orders/${order.id}/review`,
            { email: "buyer2@howsu.local", rating: 5 },
            storeHeaders
          )
          .catch((e) => e.response)
        expect(res.status).toEqual(400)
      })

      it("rejects a wrong-email caller (404, existence hidden)", async () => {
        const order = await seedOrder({ email: "buyer3@howsu.local", delivered: true })
        const res = await api
          .post(
            `/store/orders/${order.id}/review`,
            { email: "attacker@howsu.local", rating: 1 },
            storeHeaders
          )
          .catch((e) => e.response)
        expect(res.status).toEqual(404)
      })

      it("edits then deletes inside the window; masks names on the public list", async () => {
        const order = await seedOrder({ email: "buyer4@howsu.local", delivered: true })
        const created = await api.post(
          `/store/orders/${order.id}/review`,
          { email: "buyer4@howsu.local", rating: 3, comment: "ok" },
          storeHeaders
        )
        const id = created.data.review.id

        const edited = await api.post(
          `/store/reviews/${id}`,
          { email: "buyer4@howsu.local", rating: 5 },
          storeHeaders
        )
        expect(edited.data.review.rating).toEqual(5)

        const list = await api.get(
          "/store/sellers/reviews-seller/reviews",
          storeHeaders
        )
        expect(list.data.reviews[0].name).not.toContain("@")

        const del = await api.delete(`/store/reviews/${id}`, {
          ...storeHeaders,
          data: { email: "buyer4@howsu.local" },
        })
        expect(del.data.deleted).toEqual(true)
      })

      it("service: rejects edits after the window closes (400)", async () => {
        const order = await seedOrder({ email: "buyer5@howsu.local", delivered: true })
        const review = await reviews.createReview({
          seller_id: sellerId,
          order_id: order.id,
          buyer_email: "buyer5@howsu.local",
          rating: 4,
          order_product_ids: [productId],
        })
        await reviews.updateReviews([
          { id: review.id, created_at: new Date(Date.now() - 8 * DAY_MS) } as any,
        ])
        await expect(
          reviews.editReview(review.id, "buyer5@howsu.local", { rating: 1 })
        ).rejects.toThrow()
      })

      it("stores product ratings that belong to the order; rejects foreign products", async () => {
        const order = await seedOrder({ email: "buyer6@howsu.local", delivered: true })
        const ok = await api.post(
          `/store/orders/${order.id}/review`,
          {
            email: "buyer6@howsu.local",
            rating: 5,
            product_ratings: [{ product_id: productId, rating: 4 }],
          },
          storeHeaders
        )
        expect(ok.status).toEqual(201)

        const agg = await api.get(
          `/store/products/${productId}/ratings`,
          storeHeaders
        )
        expect(agg.data.count).toBeGreaterThanOrEqual(1)

        const order2 = await seedOrder({ email: "buyer6b@howsu.local", delivered: true })
        const bad = await api
          .post(
            `/store/orders/${order2.id}/review`,
            {
              email: "buyer6b@howsu.local",
              rating: 5,
              product_ratings: [{ product_id: "prod_not_in_order", rating: 4 }],
            },
            storeHeaders
          )
          .catch((e) => e.response)
        expect(bad.status).toEqual(400)
      })

      it("seller replies exactly once (second attempt 400)", async () => {
        const order = await seedOrder({ email: "buyer7@howsu.local", delivered: true })
        const created = await api.post(
          `/store/orders/${order.id}/review`,
          { email: "buyer7@howsu.local", rating: 2, comment: "late" },
          storeHeaders
        )
        const id = created.data.review.id

        const reply1 = await api.post(
          `/sellers/reviews/${id}/reply`,
          { body: "Sorry — refunded." },
          auth()
        )
        expect(reply1.data.review.reply_body).toContain("Sorry")

        const reply2 = await api
          .post(`/sellers/reviews/${id}/reply`, { body: "again" }, auth())
          .catch((e) => e.response)
        expect(reply2.status).toEqual(400)
      })

      it("admin takedown hides a review from the public list and the score", async () => {
        const order = await seedOrder({ email: "buyer8@howsu.local", delivered: true })
        const created = await api.post(
          `/store/orders/${order.id}/review`,
          { email: "buyer8@howsu.local", rating: 1, comment: "spam" },
          storeHeaders
        )
        const id = created.data.review.id

        // admin route exercised at the service layer (thin-wrapper convention)
        await reviews.removeReview(id, "abuse")

        const list = await api.get(
          "/store/sellers/reviews-seller/reviews",
          storeHeaders
        )
        expect(list.data.reviews.map((r: { id: string }) => r.id)).not.toContain(id)
      })

      it("storefront profile carries a trust block; seller dashboard sees its score", async () => {
        const profile = await api.get(
          "/store/sellers/reviews-seller",
          storeHeaders
        )
        expect(profile.data.trust).toBeDefined()
        expect(profile.data.trust.breakdown).toHaveLength(3)

        const dash = await api.get("/sellers/trust-score", auth())
        expect(dash.data).toHaveProperty("tier")
      })
    })
  },
})
```

- [ ] **Step 2: Run the spec** until green (invocation in Conventions). Iterate
on any shape mismatch (esp. the link + `createCommissionLines` payload).

- [ ] **Step 3: Full suite** — all 8 spec files green (path
`integration-tests/http`).

- [ ] **Step 4: Commit**

```bash
git add backend/integration-tests/http/reviews.spec.ts
git commit -m "test(reviews): reviews, ratings, trust-score and storefront-block spec"
```

---

## Task 8 — Live proof (mock mode, dev server)

Dev server on port 9000 (background watcher, mock keys in `.env`). Same ritual
as Phases 5–7: temp `medusa exec` seed script
(`backend/src/scripts/phase8-proof-seed.ts`) + fetch driver
(`backend/.phase8-proof.tmp.js` with a shared `.phase8-proof-state.tmp.json`).
Capture raw JSON for every step. Delete all temp artifacts afterwards (wait for
the watcher reload, `/health` 200). **No commit.**

- [ ] **Step 1: Onboard** a proof seller over HTTP:
`reviews-proof-<ts>@howsu.local`, handle `reviews-proof-<ts>`.

- [ ] **Step 2:** Seed script mints a publishable key, a published product
linked to the seller, and **5+ delivered orders** (createOrders + link +
`createCommissionLines` with `delivered_at`; mix in one `confirmed_at`, one
`reversed`, one `held_at`) so the score clears the cold-start threshold and the
components move. Persist ids to the state file.

- [ ] **Step 3: Create reviews** over HTTP (publishable key + order email) on
several delivered orders — a mix of ratings, one with `product_ratings`. Capture
201s + returned shapes.

- [ ] **Step 4: Ownership + gate proofs:** duplicate → 409; undelivered order →
400; wrong email → 404.

- [ ] **Step 5: Public reads:** `GET /store/sellers/<handle>/reviews` → masked
names, no raw emails; `GET /store/products/<id>/ratings` → `{average, count}`;
`GET /store/sellers/<handle>` → `trust` block with score/tier/breakdown.

- [ ] **Step 6: Seller surface:** `GET /sellers/reviews` (raw emails visible);
reply once → 200, second → 400; `GET /sellers/trust-score` → score + breakdown.

- [ ] **Step 7: Admin takedown:** `POST /admin/reviews/<id>/remove` → removed;
re-fetch the public list (gone) and the trust score (review_count dropped).

- [ ] **Step 8: Edit/delete window:** edit a fresh review → 200; delete →
`deleted: true`.

- [ ] **Step 9: Cleanup** — delete the temp files, wait for watcher reload,
`/health` 200, `git status` clean of temp artifacts.

---

## Task 9 — README section + full suite green

**Files:**
- Modify: `README.md` (root)
- Modify: `backend/.env`, `backend/.env.template`, `backend/.env.test`

- [ ] **Step 1: Append a `## Reviews, Ratings & Trust Score (Phase 8)` section**
after the Phase 7 section, covering:
- The `reviews` module (fourth custom module): `Review` (one per delivered
  order, unique `order_id`) + `ProductRating`; store rating feeds the score,
  comment is the human voice, `buyer_email` masked on public surfaces.
- The trust score: pure function computed on read (no stored column, no cron);
  components table (review_quality 60% Bayesian, fulfillment 25%,
  dispute_health 15%); `score = round(Σ weight × value)`; cold start "New"
  under `TRUST_SCORE_MIN_ORDERS`; named tiers.
- The lifecycle: after-delivery gate (email + `resolveLinesForOrder` +
  `delivered_at`), 7-day buyer edit/delete window (`REVIEW_EDIT_WINDOW_DAYS`),
  one seller reply, admin takedown backstop.
- API table: the 9 endpoints from the spec (§3) + the storefront `trust` block.
- Env vars: `REVIEW_EDIT_WINDOW_DAYS`, `TRUST_SCORE_MIN_ORDERS`.
- Testing note: `reviews.spec.ts` + live-proof ritual; update the Phase 7
  section's suite line and state new totals (8 spec files, N tests).

- [ ] **Step 2: Add the two env vars** to `backend/.env`, `.env.template`,
`.env.test` with their defaults (7 / 5) and a one-line comment each.

- [ ] **Step 3: Full suite verbatim** — run the whole `integration-tests/http`
suite; paste the closing `Test Suites / Tests` lines into the completion
summary.

- [ ] **Step 4: Commit**

```bash
git add README.md backend/.env.template backend/.env.test
git commit -m "docs(reviews): Phase 8 reviews, ratings & trust score section"
```

---

## Verification checklist (whole phase)

- [ ] `npx tsc --noEmit` clean after every task
- [ ] `reviews.spec.ts` green; full suite (8 files) green
- [ ] Trust score is computed on read only — no stored column, no cron
- [ ] Delivered gate + exact-email ownership on every write; wrong email → 404
- [ ] One review per order (409), one seller reply (400), 7-day window (400),
      admin takedown removes from public list **and** score
- [ ] Public surfaces mask buyer emails; seller/admin surfaces may see raw
- [ ] Bayesian damping, fresh-order exclusion, and every tier boundary asserted
      by pure-function units
- [ ] Live proof captured raw JSON for create/gates/public reads/seller
      surface/admin takedown/window — temp artifacts deleted, `/health` 200
- [ ] Commits: one per task (7 code/test commits + 1 docs commit), plan
      committed beforehand

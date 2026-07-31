# Phase 6 — Escrow Release & Returns (backend only)

## Summary

Replace the Phase 5 time-based clearance placeholder with a real escrow state
machine: money is released to the seller only when goods are confirmed
delivered and the buyer's complaint window has passed — or immediately on
explicit buyer confirmation.

- **Escrow trigger swap**: `clearPendingLines()` (time since creation) is
  replaced by `releaseDueLines()` (delivery + return-window driven). The
  commission-line ledger states (`pending → available → reserved → paid`,
  `reversed`) are UNCHANGED — Phase 5 payout machinery is untouched.
- **Delivery**: seller marks a seller order delivered (or Medusa core
  fulfillment delivery fires `delivery.created`); this starts the
  `ESCROW_RETURN_WINDOW_DAYS` (default 3) complaint window.
- **Buyer confirmation** (AliExpress model): buyer confirms receipt → funds
  release **immediately** (returnable and non-returnable alike).
- **Auto-release**: window expires with no complaint → cron releases.
- **Complaint/return**: buyer flags a return inside the window → line is
  **held**; seller confirms goods received back → commission line reversed
  (refund path); buyer cancels the return → hold lifted, release resumes.
- **Non-returnable goods** (research-backed, see below): change-of-mind
  returns are rejected; buyer confirmation still releases immediately; defect
  claims are NEVER blocked (they go through the existing admin reversal path).
- **Safety valve**: lines never marked delivered auto-release after
  `ESCROW_FALLBACK_RELEASE_DAYS` (default 30) so sellers aren't hostage to a
  buyer who ghosts and a courier that never reports.

Non-goals: frontend/UI, buyer accounts (guest email verification for now),
courier/logistics integration, automatic buyer payment refunds (commission
reversal only — the actual money refund uses the Phase 4 provider refund,
triggered by admin), dispute arbitration UI.

## Research — non-returnable goods (legal grounding)

Nigeria's **FCCPA 2018** (Part XV, s.114–131) governs. Key findings:

- **s.122** grants a right to return goods; **s.129(1)(b)** voids blanket
  "no returns, no refunds" policies — they are illegal in Nigeria.
- **Defective/unsafe/non-conforming goods must ALWAYS be refundable**,
  regardless of category. Non-returnability can only apply to
  *change-of-mind* returns. The platform must never block a defect claim.
- Recognized practical exemptions (FCCPA commentary + the near-universal
  EU Directive 2011/83/EU Art. 16 list, mirrored in most jurisdictions):
  1. Perishables & time-sensitive goods (food, drinks, fresh produce, flowers)
  2. Sealed hygiene/personal-care goods once unsealed — **perfumes,
     cosmetics, soaps, creams**, underwear, swimwear
  3. Custom-made / personalized goods
  4. Digital goods once delivered (software, downloads, vouchers, tickets)
  5. Sealed audio/video/software once unsealed
- Returns must happen "within a reasonable period" — our 3-day window is
  well inside typical practice and configurable.

**Design consequence**: non-returnability is a per-product seller-set flag
(`product.metadata.non_returnable = true`) with the category list above as
documented guidance; enforcement blocks only the buyer return request, never
the admin defect/dispute reversal.

## Guiding constraints (carried from the project)

- STRICT two-folder separation: all work in `backend/`. No frontend.
- Cross-module reads via `query.graph`; escrow state lives on the marketplace
  module's own `commission_line` rows (no foreign writes).
- Ledger amounts stay major units; money math in code.
- Mock mode default everywhere; tests run offline with zero external keys.
- PowerShell 5.1: `;` not `&&`; jest env vars set inline; temp scripts as
  files, never nested-quote `node -e`.
- Jest invocation (proven): `$env:TEST_TYPE='integration:http';
  $env:NODE_OPTIONS='--experimental-vm-modules'; $env:DB_HOST='localhost';
  $env:DB_PORT='5432'; $env:DB_USERNAME='howsu';
  $env:DB_PASSWORD='howsu_dev_password'; npx jest <spec> --silent=false
  --runInBand --forceExit`
- Conventional commits on `master`, one commit per task.

## Escrow model (decisions locked)

- Escrow state rides ON the commission line (one line per seller order):
  `parent_order_id`, `delivered_at`, `confirmed_at`, `release_due_at`,
  `held_at`, `hold_reason` — all nullable, all new columns.
- **State machine** (line `status` stays the Phase 5 enum; escrow columns
  qualify the `pending` state):

  ```
  pending, undelivered ──(delivery)──► pending, in window
      │                                   (release_due_at = delivered_at + 3d)
      │ fallback: created_at + 30d           │
      ▼                                      ├─ buyer confirms receipt ──► available (NOW)
  available (auto)                           ├─ window expires, no hold ─► available (cron)
                                             └─ return flagged in window ► pending, HELD
                                                    ├─ seller receives goods back ─► reversed
                                                    ├─ buyer cancels return ─► hold lifted, release resumes
                                                    └─ admin release (dispute resolved) ─► available
  ```

- **Buyer identity**: no buyer accounts exist yet (guest checkout), so buyer
  endpoints authenticate by **order id + exact email match** (high-entropy
  order ids; documented placeholder — upgraded to customer JWT in the
  frontend phase without changing semantics).
- **Multi-seller carts**: buyer holds the parent order id; child lines are
  found via the new `parent_order_id` column. Confirm/hold operations apply
  to all of that order's still-pending lines. Single-seller carts: parent IS
  the seller order (`parent_order_id = order_id`).
- **Non-returnable**: an order is non-returnable only if EVERY item's product
  has `metadata.non_returnable === true` (mixed orders are buyer-protective).
- **Post-release complaints**: once a line is `available|reserved|paid`,
  buyer returns are rejected (409) — the existing admin reversal
  (`POST /admin/commissions/reverse`, incl. paid-line clawback offsets)
  handles late defect claims.
- `PAYOUT_CLEARANCE_DAYS` / `clearanceDays()` / `clearPendingLines()` are
  retired. All call sites move to `releaseDueLines()`.

---

## Task 1 — Env, escrow columns, migration, parent_order_id at checkout

**Files**: `backend/.env.template`,
`backend/src/modules/marketplace/models/commission-line.ts`,
`backend/src/workflows/marketplace/create-seller-orders/steps/create-commission-lines.ts`,
`backend/src/modules/marketplace/migrations/` (generated).

- `.env.template` — replace the `PAYOUT_CLEARANCE_DAYS` line with:
  ```
  # Escrow release & returns (Phase 6) — replaces PAYOUT_CLEARANCE_DAYS
  ESCROW_RETURN_WINDOW_DAYS=3        # buyer complaint window after delivery
  ESCROW_FALLBACK_RELEASE_DAYS=30    # auto-release when delivery is never recorded
  ```
- `commission-line.ts` — add after `reversal_reason`:
  ```ts
  // Escrow (Phase 6): release is driven by delivery + return window, not time
  parent_order_id: model.text().nullable(),
  delivered_at: model.dateTime().nullable(),
  confirmed_at: model.dateTime().nullable(),
  release_due_at: model.dateTime().nullable(),
  held_at: model.dateTime().nullable(),
  hold_reason: model.text().nullable(),
  ```
  Update the header comment: pending now means "in escrow — undelivered, in
  window, or held".
- `create-commission-lines.ts` — in the `linesData` map add:
  ```ts
  parent_order_id:
    (order as { metadata?: { parent_order_id?: string } }).metadata
      ?.parent_order_id ?? order.id,
  ```
- Generate + run migration: `npx medusa db:generate marketplace` then
  `npx medusa db:migrate` (junction fallback per Phase 2 plan if fast-glob
  misbehaves). Inspect the generated `Migration*.ts` — 6 nullable columns on
  `commission_line`, no data backfill needed (old rows: escrow fields null,
  released via fallback path only if still pending).
- `npx tsc --noEmit` clean. Commit:
  `feat(escrow): commission-line escrow columns + parent order id`

**Done when**: migration applied; existing suites still green (no behavior
change yet — `clearPendingLines` untouched until Task 2).

## Task 2 — Service escrow state machine + release rewiring

**Files**: `backend/src/modules/marketplace/service.ts`,
`backend/src/api/sellers/balance/route.ts`,
`backend/src/workflows/marketplace/create-payout/index.ts`,
`backend/src/lib/payments/payouts/run-scheduled.ts`,
`backend/src/jobs/release-escrow-lines.ts` (new, replaces
`backend/src/jobs/clear-commission-lines.ts`),
`backend/integration-tests/http/payouts.spec.ts` (env line only).

- `service.ts` — remove `clearanceDays()`, `clearPendingLines()` and
  `DEFAULT_CLEARANCE_DAYS`; add:
  ```ts
  const DEFAULT_RETURN_WINDOW_DAYS = 3
  const DEFAULT_FALLBACK_RELEASE_DAYS = 30
  const DAY_MS = 24 * 60 * 60 * 1000

  returnWindowDays(): number {
    const parsed = Number(process.env.ESCROW_RETURN_WINDOW_DAYS)
    return Number.isFinite(parsed) && parsed >= 0
      ? parsed
      : DEFAULT_RETURN_WINDOW_DAYS
  }

  fallbackReleaseDays(): number {
    const parsed = Number(process.env.ESCROW_FALLBACK_RELEASE_DAYS)
    return Number.isFinite(parsed) && parsed >= 0
      ? parsed
      : DEFAULT_FALLBACK_RELEASE_DAYS
  }

  /**
   * Lines for a buyer-visible order id: direct match (seller/child order)
   * first, then children of a multi-seller parent.
   */
  async resolveLinesForOrder(orderId: string) {
    const direct = await this.listCommissionLines({ order_id: orderId })
    if (direct.length) {
      return direct
    }
    return await this.listCommissionLines({ parent_order_id: orderId })
  }

  /**
   * Delivery recorded (seller endpoint or core `delivery.created`).
   * Starts the return window. Idempotent — already-delivered lines skip.
   */
  async markOrderDelivered(orderId: string, now: Date = new Date()) {
    const lines = await this.resolveLinesForOrder(orderId)
    const updates = lines
      .filter((line) => line.status === "pending" && !line.delivered_at)
      .map((line) => ({
        id: line.id,
        delivered_at: now,
        release_due_at: new Date(
          now.getTime() + this.returnWindowDays() * DAY_MS
        ),
      }))
    if (updates.length) {
      await this.updateCommissionLines(updates)
    }
    return updates.length
  }

  /**
   * Explicit buyer confirmation — releases IMMEDIATELY (AliExpress model).
   * Held lines are skipped: an open return beats a confirmation.
   */
  async confirmOrderReceipt(orderId: string, now: Date = new Date()) {
    const lines = await this.resolveLinesForOrder(orderId)
    if (!lines.length) {
      throw new MedusaError(
        MedusaError.Types.NOT_FOUND,
        `No commission line found for order ${orderId}`
      )
    }
    const updates = lines
      .filter((line) => line.status === "pending" && !line.held_at)
      .map((line) => ({
        id: line.id,
        delivered_at: line.delivered_at ?? now,
        confirmed_at: now,
        release_due_at: now,
        status: "available" as const,
        available_at: now,
      }))
    if (updates.length) {
      await this.updateCommissionLines(updates)
    }
    return await this.resolveLinesForOrder(orderId)
  }

  /**
   * Buyer return/complaint (or admin hold). Only pending lines can be held —
   * released money is clawed back via reverseCommissionForOrder instead.
   */
  async holdForReturn(orderId: string, reason: string, now: Date = new Date()) {
    const lines = await this.resolveLinesForOrder(orderId)
    if (!lines.length) {
      throw new MedusaError(
        MedusaError.Types.NOT_FOUND,
        `No commission line found for order ${orderId}`
      )
    }
    const eligible = lines.filter((line) => line.status === "pending")
    if (!eligible.length) {
      throw new MedusaError(
        MedusaError.Types.CONFLICT,
        `Escrow for order ${orderId} was already released — use the admin reversal flow`
      )
    }
    const toHold = eligible.filter((line) => !line.held_at)
    if (toHold.length) {
      await this.updateCommissionLines(
        toHold.map((line) => ({
          id: line.id,
          held_at: now,
          hold_reason: reason,
        }))
      )
    }
    return await this.resolveLinesForOrder(orderId)
  }

  /**
   * Hold lifted (buyer cancelled the return / admin resolved the dispute).
   * With releaseNow the funds go available immediately; otherwise the
   * original release_due_at resumes (cron releases it if already past).
   */
  async liftHold(
    orderId: string,
    opts: { releaseNow?: boolean } = {},
    now: Date = new Date()
  ) {
    const lines = await this.resolveLinesForOrder(orderId)
    const held = lines.filter(
      (line) => line.status === "pending" && line.held_at
    )
    if (held.length) {
      await this.updateCommissionLines(
        held.map((line) =>
          opts.releaseNow
            ? {
                id: line.id,
                held_at: null,
                hold_reason: null,
                status: "available" as const,
                available_at: now,
                release_due_at: now,
              }
            : { id: line.id, held_at: null, hold_reason: null }
        )
      )
    }
    return await this.resolveLinesForOrder(orderId)
  }

  /**
   * Escrow release sweep (replaces Phase 5 clearPendingLines):
   * 1. window expired, not held  → available
   * 2. never delivered, older than the fallback window, not held → available
   */
  async releaseDueLines(now: Date = new Date()): Promise<number> {
    const due = await this.listCommissionLines(
      { status: "pending", held_at: null, release_due_at: { $lte: now } },
      { take: null }
    )
    const fallbackCutoff = new Date(
      now.getTime() - this.fallbackReleaseDays() * DAY_MS
    )
    const stale = await this.listCommissionLines(
      {
        status: "pending",
        held_at: null,
        delivered_at: null,
        created_at: { $lte: fallbackCutoff },
      },
      { take: null }
    )
    const seen = new Set(due.map((line) => line.id))
    const all = [...due, ...stale.filter((line) => !seen.has(line.id))]
    if (!all.length) {
      return 0
    }
    await this.updateCommissionLines(
      all.map((line) => ({
        id: line.id,
        status: "available" as const,
        available_at: now,
      }))
    )
    return all.length
  }
  ```
- Call-site rewiring (grep `clearPendingLines|clearanceDays` — exactly these):
  - `src/api/sellers/balance/route.ts` L38 → `await marketplace.releaseDueLines()`;
    L43 response field `clearance_days` → `return_window_days:
    marketplace.returnWindowDays()`.
  - `src/workflows/marketplace/create-payout/index.ts` L65 →
    `await marketplace.releaseDueLines()`.
  - `src/lib/payments/payouts/run-scheduled.ts` L28 →
    `await marketplace.releaseDueLines()`.
  - Delete `src/jobs/clear-commission-lines.ts`; create
    `src/jobs/release-escrow-lines.ts` (same shape: resolve marketplace,
    `const released = await marketplace.releaseDueLines()`, log when > 0,
    `config = { name: "release-escrow-lines", schedule: "0 * * * *" }`).
- `payouts.spec.ts` — line 27: `process.env.PAYOUT_CLEARANCE_DAYS = "0"` →
  `process.env.ESCROW_FALLBACK_RELEASE_DAYS = "0"`; update the two comments
  (L22-23, L258) to mention the fallback release instead of clearance.
  (Seeded pending lines have no `delivered_at`, so fallback=0 releases them
  on the balance route exactly like clearance=0 did.)
- `npx tsc --noEmit` clean; run payouts spec — 18/18 must stay green.
- Commit: `feat(escrow): delivery/confirm/hold/release state machine replaces time clearance`

**Done when**: payouts + marketplace suites green with the new release logic.

## Task 3 — Returnability lib + delivery/return subscribers

**Files**: `backend/src/lib/escrow/returnability.ts` (new),
`backend/src/lib/escrow/order-access.ts` (new),
`backend/src/subscribers/fulfillment-delivered.ts` (new),
`backend/src/subscribers/return-requested.ts` (new),
`backend/src/subscribers/return-received.ts` (new).

- `returnability.ts`:
  ```ts
  import { MedusaContainer } from "@medusajs/framework/types"
  import { ContainerRegistrationKeys } from "@medusajs/framework/utils"

  // FCCPA 2018 (s.122/s.129) + EU 2011/83/EU Art.16 guidance. Enforcement is
  // the per-product `metadata.non_returnable` flag a seller sets at listing;
  // this list is documentation/storefront copy, not runtime matching.
  export const NON_RETURNABLE_CATEGORY_GUIDANCE = [
    "perishables (food, drinks, fresh produce, flowers)",
    "sealed hygiene & personal care once unsealed (perfumes, cosmetics, soaps, creams, underwear, swimwear)",
    "custom-made or personalized goods",
    "digital goods once delivered (software, downloads, vouchers, tickets)",
    "sealed audio/video/software once unsealed",
  ] as const

  /**
   * Non-returnable only when EVERY item's product is flagged — mixed orders
   * stay returnable (buyer-protective). Defect claims are never blocked by
   * this flag; they go through the admin reversal path.
   */
  export async function isOrderNonReturnable(
    container: MedusaContainer,
    orderId: string
  ): Promise<boolean> {
    const query = container.resolve(ContainerRegistrationKeys.QUERY)
    const { data: orders } = await query.graph({
      entity: "order",
      fields: ["id", "items.product_id"],
      filters: { id: orderId },
    })
    const productIds = (orders[0]?.items ?? [])
      .map((item: { product_id?: string | null }) => item?.product_id)
      .filter((id: string | null | undefined): id is string => Boolean(id))
    if (!productIds.length) {
      return false
    }
    const { data: products } = await query.graph({
      entity: "product",
      fields: ["id", "metadata"],
      filters: { id: productIds },
    })
    return (
      products.length > 0 &&
      products.every((p) => p.metadata?.non_returnable === true)
    )
  }
  ```
- `order-access.ts` — guest-order ownership check used by all buyer routes:
  ```ts
  import { MedusaContainer } from "@medusajs/framework/types"
  import {
    ContainerRegistrationKeys,
    MedusaError,
  } from "@medusajs/framework/utils"

  // No buyer accounts yet (guest checkout): possession of the high-entropy
  // order id + the exact checkout email is the ownership proof. The frontend
  // phase upgrades this to customer JWT without changing route semantics.
  export async function assertOrderEmail(
    container: MedusaContainer,
    orderId: string,
    email: string
  ) {
    const query = container.resolve(ContainerRegistrationKeys.QUERY)
    const { data } = await query.graph({
      entity: "order",
      fields: ["id", "email"],
      filters: { id: orderId },
    })
    const order = data[0]
    if (
      !order ||
      (order.email ?? "").toLowerCase() !== email.trim().toLowerCase()
    ) {
      throw new MedusaError(MedusaError.Types.NOT_FOUND, "Order not found")
    }
    return order
  }
  ```
- `fulfillment-delivered.ts` — core admin fulfillment delivery feeds escrow:
  ```ts
  import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
  import {
    ContainerRegistrationKeys,
    FulfillmentWorkflowEvents,
  } from "@medusajs/framework/utils"
  import { MARKETPLACE_MODULE } from "../modules/marketplace"
  import MarketplaceModuleService from "../modules/marketplace/service"

  export default async function fulfillmentDeliveredHandler({
    event: { data },
    container,
  }: SubscriberArgs<{ id: string }>) {
    const query = container.resolve(ContainerRegistrationKeys.QUERY)
    const { data: fulfillments } = await query.graph({
      entity: "fulfillment",
      fields: ["id", "order.id"],
      filters: { id: data.id },
    })
    const orderId = fulfillments[0]?.order?.id
    if (!orderId) {
      return
    }
    const marketplace: MarketplaceModuleService =
      container.resolve(MARKETPLACE_MODULE)
    await marketplace.markOrderDelivered(orderId)
  }

  export const config: SubscriberConfig = {
    event: FulfillmentWorkflowEvents.DELIVERY_CREATED,
  }
  ```
- `return-requested.ts` — core return request holds escrow (payload
  `{ order_id, return_id }`, event `OrderWorkflowEvents.RETURN_REQUESTED`);
  wrap `holdForReturn(order_id, \`return ${return_id} requested\`)` in
  try/catch — a CONFLICT (already released) is logged at warn and swallowed
  so core return flows never break.
- `return-received.ts` — event `OrderWorkflowEvents.RETURN_RECEIVED`; calls
  `reverseCommissionForOrder(order_id, \`return ${return_id} received\`)`
  with the same try/catch-and-warn pattern (reserved lines throw CONFLICT —
  admin reconciles the payout first).
- `npx tsc --noEmit` clean. Commit:
  `feat(escrow): returnability policy lib + delivery/return subscribers`

**Done when**: tsc clean, dev server boots with the three subscribers listed.

## Task 4 — Buyer endpoints + middleware schemas

**Files**: `backend/src/api/store/orders/[id]/confirm-receipt/route.ts` (new),
`backend/src/api/store/orders/[id]/request-return/route.ts` (new),
`backend/src/api/store/orders/[id]/cancel-return/route.ts` (new),
`backend/src/api/middlewares.ts`.

All three are POST under `/store` (publishable-key protected by Medusa
automatically) and validate email ownership via `assertOrderEmail`.

- `middlewares.ts` — add schemas + matchers:
  ```ts
  export const PostConfirmReceiptSchema = z.object({
    email: z.string().email(),
  })

  export const PostRequestReturnSchema = z.object({
    email: z.string().email(),
    reason: z.string().min(3),
  })

  export const PostCancelReturnSchema = z.object({
    email: z.string().email(),
  })
  ```
  ```ts
  {
    matcher: "/store/orders/:id/confirm-receipt",
    methods: ["POST"],
    middlewares: [validateAndTransformBody(PostConfirmReceiptSchema)],
  },
  {
    matcher: "/store/orders/:id/request-return",
    methods: ["POST"],
    middlewares: [validateAndTransformBody(PostRequestReturnSchema)],
  },
  {
    matcher: "/store/orders/:id/cancel-return",
    methods: ["POST"],
    middlewares: [validateAndTransformBody(PostCancelReturnSchema)],
  },
  ```
- `confirm-receipt/route.ts`:
  ```ts
  import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
  import { MARKETPLACE_MODULE } from "../../../../../modules/marketplace"
  import MarketplaceModuleService from "../../../../../modules/marketplace/service"
  import { assertOrderEmail } from "../../../../../lib/escrow/order-access"

  // Buyer says "I received it" → escrow releases to the seller immediately.
  export const POST = async (req: MedusaRequest, res: MedusaResponse) => {
    const { email } = req.validatedBody as { email: string }
    await assertOrderEmail(req.scope, req.params.id, email)

    const marketplace: MarketplaceModuleService =
      req.scope.resolve(MARKETPLACE_MODULE)
    const lines = await marketplace.confirmOrderReceipt(req.params.id)

    res.json({ order_id: req.params.id, lines })
  }
  ```
- `request-return/route.ts` — ownership check, then:
  1. `isOrderNonReturnable(req.scope, req.params.id)` → true ⇒ throw
     `MedusaError(NOT_ALLOWED, "These items are non-returnable (sealed,
     perishable or personalized). If the item arrived damaged or defective,
     contact support — defect claims are always accepted.")`
  2. window check: resolve lines via
     `marketplace.resolveLinesForOrder(req.params.id)`; if some line has
     `delivered_at` set AND `release_due_at < new Date()` ⇒ throw
     `MedusaError(NOT_ALLOWED, "The return window has closed")`. (Undelivered
     orders may still be held — pre-delivery cancellation.)
  3. `await marketplace.holdForReturn(req.params.id, reason)` (its CONFLICT
     covers already-released lines) → `res.json({ order_id, lines })`.
- `cancel-return/route.ts` — ownership check, then
  `marketplace.liftHold(req.params.id)` (no releaseNow — the original window
  resumes; if past due the hourly job releases) → `res.json({ order_id, lines })`.
- `npx tsc --noEmit` clean. Commit:
  `feat(escrow): buyer confirm-receipt / request-return / cancel-return APIs`

**Done when**: tsc clean; routes reachable (404-on-wrong-email verified in Task 6).

## Task 5 — Seller + admin escrow endpoints

**Files**: `backend/src/api/sellers/orders/[id]/mark-delivered/route.ts` (new),
`backend/src/api/sellers/orders/[id]/return-received/route.ts` (new),
`backend/src/api/admin/escrow/hold/route.ts` (new),
`backend/src/api/admin/escrow/release/route.ts` (new),
`backend/src/api/middlewares.ts` (admin schemas only — seller routes ride the
existing `/sellers/*` auth matcher and take no body).

- Seller ownership helper (inline in each seller route, matching the
  `sellers/orders` pattern):
  ```ts
  import { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
  import {
    ContainerRegistrationKeys,
    MedusaError,
  } from "@medusajs/framework/utils"
  import { MARKETPLACE_MODULE } from "../../../../../modules/marketplace"
  import MarketplaceModuleService from "../../../../../modules/marketplace/service"

  const resolveOwnedLine = async (
    req: AuthenticatedMedusaRequest,
    orderId: string
  ) => {
    const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
    const { data: admins } = await query.graph({
      entity: "seller_admin",
      fields: ["seller.id"],
      filters: { id: req.auth_context.actor_id },
    })
    const sellerId = admins[0]?.seller?.id
    const marketplace: MarketplaceModuleService =
      req.scope.resolve(MARKETPLACE_MODULE)
    const [line] = await marketplace.listCommissionLines({ order_id: orderId })
    if (!line || !sellerId || line.seller_id !== sellerId) {
      throw new MedusaError(MedusaError.Types.NOT_FOUND, "Order not found")
    }
    return { marketplace, line }
  }
  ```
- `mark-delivered/route.ts` POST: `resolveOwnedLine` →
  `marketplace.markOrderDelivered(req.params.id)` →
  `res.json({ order_id, lines: await marketplace.resolveLinesForOrder(req.params.id) })`.
- `return-received/route.ts` POST: `resolveOwnedLine`; require
  `line.held_at && line.status === "pending"` else
  `MedusaError(NOT_ALLOWED, "No open return on this order")`; then
  `marketplace.reverseCommissionForOrder(req.params.id, "return received by seller")`
  → `res.json({ commission_line })`. (Buyer's money refund = Phase 4
  provider refund, admin-triggered — commission ledger only here.)
- Admin schemas in `middlewares.ts`:
  ```ts
  export const PostEscrowHoldSchema = z.object({
    order_id: z.string().min(1),
    reason: z.string().min(3),
  })

  export const PostEscrowReleaseSchema = z.object({
    order_id: z.string().min(1),
    release_now: z.boolean().optional(),
  })
  ```
  Matchers `/admin/escrow/hold` + `/admin/escrow/release`, POST, body
  validation (admin auth is built in).
- `hold/route.ts` POST → `marketplace.holdForReturn(order_id, reason)` →
  `{ lines }`. `release/route.ts` POST →
  `marketplace.liftHold(order_id, { releaseNow: release_now ?? false })` →
  `{ lines }`.
- `npx tsc --noEmit` clean. Commit:
  `feat(escrow): seller delivery/return-received + admin hold/release APIs`

**Done when**: tsc clean; foreign-seller 404 proven in Task 6.

## Task 6 — Integration tests (escrow.spec.ts)

**Files**: `backend/integration-tests/http/escrow.spec.ts` (new).

Module top (same conventions as payouts.spec):
```ts
jest.setTimeout(120 * 1000)
process.env.PAYSTACK_SECRET_KEY = "mock"
process.env.CIRCLE_API_KEY = "mock"
process.env.CRYPTO_ENABLED = "true"
process.env.ESCROW_RETURN_WINDOW_DAYS = "3"
process.env.ESCROW_FALLBACK_RELEASE_DAYS = "30"
process.env.PAYOUT_MIN_NGN = "1"
process.env.PAYOUT_SCHEDULE_ENABLED = "false"
```

`beforeAll`: onboard seller `escrow-seller@howsu.local` (register → POST
/sellers → login, handle `escrow-seller`), create verified bank payout
account (058/0123456789), mint a publishable key for store routes:
```ts
const apiKeyModule = getContainer().resolve(Modules.API_KEY)
const [pubKey] = await apiKeyModule.createApiKeys([
  { title: "escrow-spec", type: "publishable", created_by: "escrow-spec" },
])
storeHeaders = { headers: { "x-publishable-api-key": pubKey.token } }
```
then `dbUtils.snapshot()`.

Order seeding helper (module services + link — checkout→line creation is
already proven in marketplace.spec):
```ts
const seedOrder = async ({
  email = "buyer@howsu.local",
  nonReturnable = false,
  extraReturnableItem = false,
} = {}) => {
  const container = getContainer()
  const productModule = container.resolve(Modules.PRODUCT)
  const orderModule = container.resolve(Modules.ORDER)
  const link = container.resolve(ContainerRegistrationKeys.LINK)

  const products = await productModule.createProducts([
    {
      title: nonReturnable ? "Mock Perfume" : "Mock Sneakers",
      status: "published",
      ...(nonReturnable ? { metadata: { non_returnable: true } } : {}),
    },
    ...(extraReturnableItem
      ? [{ title: "Mock Belt", status: "published" as const }]
      : []),
  ])

  const order = await orderModule.createOrders({
    currency_code: "ngn",
    email,
    items: products.map((p) => ({
      title: p.title,
      product_id: p.id,
      quantity: 1,
      unit_price: 10000,
    })),
  })

  await link.create([
    {
      [MARKETPLACE_MODULE]: { seller_id: sellerId },
      [Modules.ORDER]: { order_id: order.id },
    },
  ])

  await marketplace.createCommissionLines({
    order_id: order.id,
    parent_order_id: order.id,
    currency_code: "ngn",
    order_total: 10000,
    rate: 0.05,
    commission_amount: 500,
    net_amount: 9500,
    seller_id: sellerId,
  })

  return order
}
```

Tests (in-app suite):
1. **Seller mark-delivered starts the window** — POST
   `/sellers/orders/:id/mark-delivered`; line has `delivered_at` set and
   `release_due_at` ≈ delivered_at + 3d (assert day delta = 3); replay is
   idempotent (delivered_at unchanged).
2. **Foreign seller gets 404** — onboard a second seller inside the test,
   its token on the first seller's order → 404, line untouched.
3. **Buyer confirm-receipt releases immediately** — POST
   `/store/orders/:id/confirm-receipt` `{ email }` with storeHeaders →
   line `available`, `confirmed_at` set; wrong email → 404; replay → still
   one line, still available.
4. **Auto-release after the window** — mark delivered;
   `releaseDueLines(new Date())` → 0; `releaseDueLines(now + 4d)` → 1,
   line `available`.
5. **Return inside the window holds funds** — mark delivered; POST
   `request-return` `{ email, reason }` → line `held_at` set, still
   `pending`; `releaseDueLines(now + 4d)` → 0 (held lines never release).
6. **Seller return-received reverses the line** — held order → POST
   `/sellers/orders/:id/return-received` → line `reversed`,
   `reversal_reason` "return received by seller"; balance excludes it.
7. **Buyer cancel-return resumes release** — held order → POST
   `cancel-return` → `held_at` null; `releaseDueLines(now + 4d)` → 1.
8. **Non-returnable: return rejected, confirm releases** — seedOrder
   nonReturnable; `request-return` → 400/`not_allowed` with "non-returnable"
   in message; `confirm-receipt` → available immediately.
9. **Mixed order stays returnable** — seedOrder nonReturnable +
   extraReturnableItem; `request-return` → 200, line held.
10. **Window closed** — mark delivered, `releaseDueLines(now + 4d)` (line
    released); `request-return` → 409 (already released).
11. **Fallback release for never-delivered lines** —
    `releaseDueLines(now + 31d)` → 1 (no delivery ever recorded).
12. **Escrow → payout seam intact** — confirm receipt, then POST
    `/sellers/payouts` `{ rail: "paystack" }` → processing payout for 9500,
    line `reserved`.
13. **Admin hold + release-now (service level)** — no admin-HTTP precedent
    exists in the suites (payouts.spec reconciles via direct import), and the
    admin route bodies are one-liners over these methods, so assert the
    behavior via `marketplace.holdForReturn(orderId, "admin dispute")` →
    line held, then `marketplace.liftHold(orderId, { releaseNow: true })` →
    line `available` with `available_at` set. The HTTP admin routes are
    covered by the Task 7 live proof (step 7, admin JWT).
14. **No-regression** — GET `/health` → 200.

Run the spec, then the FULL suite (all 6 spec files) — everything green.
Commit: `test(escrow): full escrow lifecycle integration spec`

**Done when**: full suite green, reported verbatim.

## Task 7 — Live proof (mock mode, dev server, no commit)

Dev server with defaults (`npm run dev`, mock keys). Temp node script
(`backend/.phase6-proof.tmp.js`, fetch + pg, deleted afterwards) driving real
HTTP; capture raw JSON for each step:
1. Onboard seller + bank account; seed one returnable order + line (SQL with
   `raw_*` jsonb `{"value":"...","precision":20}` columns — Phase 5 lesson).
2. Seller `mark-delivered` → line shows `delivered_at`, `release_due_at` +3d.
3. Buyer `request-return` (publishable key from the seeded store) → held.
4. Seller `return-received` → line reversed.
5. Second order: buyer `confirm-receipt` → available; `POST /sellers/payouts`
   → processing payout; webhook `transfer.success` → paid.
6. Non-returnable order: `request-return` → 400 with the FCCPA-friendly
   message; `confirm-receipt` → available.
7. Admin hold/release round-trip via admin JWT
   (`proof-admin@howsu.local` exists from Phase 5).
Record raw responses in the completion summary. Delete temp artifacts.
No commit.

## Task 8 — README docs + full suite green

**Files**: `README.md` (root — phase docs live here, NOT backend/README.md).

- Append `## Escrow Release & Returns (Phase 6)` after the Phase 5 section:
  state-machine diagram, the release triggers table (confirm / window expiry
  / fallback), non-returnable policy + FCCPA grounding + category guidance
  list, API table (3 buyer + 2 seller + 2 admin routes), config table
  (`ESCROW_RETURN_WINDOW_DAYS`, `ESCROW_FALLBACK_RELEASE_DAYS`, note that
  `PAYOUT_CLEARANCE_DAYS` is retired), testing note (escrow.spec.ts).
- Update the Phase 5 section's clearance-placeholder sentence: struck
  through / "replaced in Phase 6 by delivery-confirmation escrow".
- Full suite one more time — 6 suites green, reported verbatim.
- Commit: `docs(escrow): Phase 6 escrow release & returns section`

---

## Test plan summary

- `escrow.spec.ts`: 14 tests (above).
- `payouts.spec.ts`: 18 tests must stay green after the Task 2 env swap.
- Full suite: health, marketplace, ai, payments, payouts, escrow — all green.

## Assumptions & compliance flags

- Buyer endpoints use order-id + email ownership until buyer accounts exist
  (frontend phase). Seller self-confirmation risk is bounded: it only
  accelerates release by ≤ the window, and complaints/disputes still reverse.
- Buyer payment refunds (money back to the buyer) are executed through the
  Phase 4 provider refunds by an admin; Phase 6 owns only the seller-side
  ledger consequence (`reversed` / clawback offset).
- FCCPA: defect claims are never blocked by the non-returnable flag — admin
  reversal path stays open for every category.
- Existing pending lines (pre-Phase 6) have no escrow fields → they release
  via the 30-day fallback, not silently on the old 7-day clock.

---

# Roadmap (recorded for later phases — NOT in Phase 6 scope)

The product thesis: not another e-commerce site — a Nigerian market complex
online, where selling is social, gamified and habit-forming; dead-simple
buyer UX on top of serious settlement rails underneath (already built:
multi-rail payments, ledger, payouts, escrow).

## Phase 7 — Store identity & redeemables
Per-store unique URL (their own storefront/front door), store-scoped
vouchers, fixed-amount vouchers and gift cards redeemable only at that
store's checkout; the same primitives power ticketing for digital/service
businesses (clubs, eateries, events, hosting).

## Phase 8 — Two-way tipping
Buyer → seller cash tips; seller → buyer cash or extra-product tips. Rides
the existing payment rails + settlement ledger (tips are ledger lines with
0% commission or a small platform fee — decide then).

## Phase 9 — Group buying & referral growth engine
- **Team/group buy** (Pinduoduo core loop): a buyer unlocks a bigger discount
  by bringing N collective buyers (2, 4, 5+ tiers); share links do the
  distribution. Price drops are seller-configured per product.
- **Referral program (Airbnb-style, capped)**: refer a buyer → reward when
  their first transaction COMPLETES (escrow released — Phase 6 makes this
  gate real); refer a seller → reward on their first completed sale. Both
  referrer AND referee earn. Caps: ₦1,000,000 lifetime buyer earnings,
  ₦1,500,000 lifetime seller earnings. Earnings are withdrawable through the
  existing payout rails.
- **Anti-abuse**: 1 device = 1 user for rewards — device fingerprinting +
  velocity rules; rewards only on transaction-completion (escrow-released),
  never on signup alone. Compliance: device fingerprinting is personal data
  under Nigeria's NDPA 2023 — consent + disclosure required.

## Phase 10 — Campaign reward engine (ad-revenue redistribution, NOT a lottery)
The ad-system replacement: like X/Twitter sharing ad revenue with creators,
but the "ad spend" goes back to a concentrated set of real buyers instead of
being spread thin on impressions. Stores co-create a campaign (goes live at
5+ participating stores). Each store joins with money (their would-be ad
budget) into one pooled campaign reward wallet. Contribution size buys
product-slot count + visibility priority inside the campaign. Buyers who
purchase any campaign product become eligible for cash rewards from the
pool — revealed only after checkout, PAID only after the transaction fully
completes (escrow released, no return). Campaigns can award products
instead of cash (buy-1-get-1, mystery product). More stores → bigger pool →
more buyers → real sales, not impressions.
**Design note**: structure the reward criteria as performance/activity-based
ad-revenue redistribution (verified purchase activity, engagement,
completion) rather than a purchase-tied game of pure chance — that keeps it
in rev-share territory (creator-fund model) and out of promotional-lottery
territory; revisit the exact criteria when planning this phase.

## Cross-cutting: habit-loop layer (research findings — what was missing)
From Pinduoduo/Temu/Duolingo/Hook-model research, mechanics worth adding
around the above (each is a thin layer on the existing ledger/wallet):
1. **Coin economy + expiring cashback** — earn coins on actions (buy,
   review-with-photo, daily open), spend as checkout discounts; expiry
   creates the comeback trigger.
2. **Daily check-in streaks** — escalating coin rewards; loss aversion locks
   the habit.
3. **Post-checkout spin/mystery box** — variable reward at the natural
   dopamine peak (pairs with the campaign engine).
4. **"Help me chop" price-drop links** — friends tap your link, price falls;
   Pinduoduo's single most viral loop; fits the group-buy engine.
5. **Flash drops with countdowns** — scarcity + appointment shopping.
6. **Live social proof feed** — "someone in Surulere just won ₦50k" /
   "3 people bought this in the last hour"; near-miss + winner announcements
   feed the campaign engine's fairness theater.
7. **Buyer & seller tiers/levels** — status ladders (progress bars
   everywhere); seller tiers gate campaign perks, buyer tiers gate early
   access to drops.
8. **Browse/watch missions** — Temu-style "view 5 stores, earn coins"
   (careful: only where it drives real discovery, not junk engagement).
9. **UGC rewards** — photo reviews earn coins; reviews are the trust engine
   that makes escrow + returns credible.
10. **Wishlist price-watch alerts** — external trigger that re-opens the app.
Guardrails: every reward settles only on COMPLETED transactions (the Phase 6
escrow gate is the anti-fraud primitive for all of it); NLRC for anything
chance-based; NDPA consent for fingerprinting; keep the buyer-facing surface
simple — complexity lives in the backend.

## AI provider note
The AI module stays provider-agnostic (`AI_PROVIDER` env switch, Vercel AI
SDK). Groq is NOT locked in — a Chinese or free OpenAI-compatible model
(DeepSeek, Qwen, GLM, etc.) may replace it. Action for a later phase: add a
generic `openai-compatible` provider option (base URL + key + model envs) so
any such endpoint is a pure env change.

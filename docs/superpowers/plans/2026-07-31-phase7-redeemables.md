# Phase 7 — Store Identity & Redeemables Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Public storefront resolution per seller handle + a new `redeemables`
module (gift cards / vouchers / tickets) — seller-created, store-scoped,
sellable or giftable, redeemable digitally at checkout or physically in-store
by code/QR.

**Architecture:** Third custom module (`redeemables`) beside `marketplace` and
`ai`, owning `Redeemable` + `Redemption` models. Sold instruments ride the
existing checkout → commission-line rails; redeemable-only seller orders
release escrow instantly via the existing `confirmOrderReceipt`. Redemption is
one service with two doors: cart-apply (checkout) and seller-side redeem
(in-store).

**Tech Stack:** Medusa v2.18 (modules SDK, query.graph, links, subscribers,
zod middlewares), PostgreSQL, Jest via `medusaIntegrationTestRunner`.

**Spec:** `docs/superpowers/specs/2026-07-31-phase7-store-redeemables-design.md`
(all decisions locked there: seller autonomy, classic semantics, commission at
purchase, instant release for sold gift cards/tickets, Approach A).

**Conventions that apply to every task** (established Phases 1–6):
- Backend only, inside `backend/`. Mock mode first — no new env vars needed.
- MedusaError → HTTP: NOT_FOUND→404, NOT_ALLOWED→400, CONFLICT→409.
- `npx tsc --noEmit` clean after every task. One conventional commit per task.
- Jest (PowerShell 5.1):
  `$env:TEST_TYPE='integration:http'; $env:NODE_OPTIONS='--experimental-vm-modules'; $env:DB_HOST='localhost'; $env:DB_PORT='5432'; $env:DB_USERNAME='howsu'; $env:DB_PASSWORD='howsu_dev_password'; npx jest <path> --silent=false --runInBand --forceExit`
- `npx medusa db:generate <module>` can exceed 180s — run in background with
  `Tee-Object` logging (Phase 6 lesson).

---

## Task 1 — Module scaffold: models, service shell, registration, migration

**Files:**
- Create: `backend/src/modules/redeemables/models/redeemable.ts`
- Create: `backend/src/modules/redeemables/models/redemption.ts`
- Create: `backend/src/modules/redeemables/service.ts`
- Create: `backend/src/modules/redeemables/index.ts`
- Modify: `backend/medusa-config.ts` (add module to `modules` array)
- Generated: `backend/src/modules/redeemables/migrations/Migration*.ts`

- [ ] **Step 1: Write the models**

`backend/src/modules/redeemables/models/redeemable.ts`:

```ts
import { model } from "@medusajs/framework/utils"
import Redemption from "./redemption"

// Store-scoped bearer instruments (Phase 7). Classic semantics:
//   gift_card — stored value; balance draws down across redemptions to 0
//   voucher   — one-shot discount (fixed amount or percent), dies on first use
//   ticket    — one-shot admission (door/venue), never usable at checkout
// `price` set ⇒ purchasable template: sales mint FRESH coded instances;
// `price` null ⇒ gift/free-issue instrument.
const Redeemable = model.define("redeemable", {
  id: model.id().primaryKey(),
  seller_id: model.text(),
  type: model.enum(["gift_card", "voucher", "ticket"]),
  code: model.text().unique(),
  status: model
    .enum(["active", "redeemed", "cancelled", "expired"])
    .default("active"),
  currency_code: model.text().default("ngn"),
  title: model.text(),
  face_value: model.bigNumber().nullable(),
  balance: model.bigNumber().nullable(),
  discount_type: model.enum(["fixed", "percent"]).nullable(),
  discount_value: model.float().nullable(),
  price: model.bigNumber().nullable(),
  product_id: model.text().nullable(),
  expires_at: model.dateTime().nullable(),
  issued_to_email: model.text().nullable(),
  source_order_id: model.text().nullable(),
  redemptions: model.hasMany(() => Redemption, {
    mappedBy: "redeemable",
  }),
})

export default Redeemable
```

`backend/src/modules/redeemables/models/redemption.ts`:

```ts
import { model } from "@medusajs/framework/utils"
import Redeemable from "./redeemable"

// Audit row per use — the seller's receipt and the buyer's proof.
const Redemption = model.define("redemption", {
  id: model.id().primaryKey(),
  amount_applied: model.bigNumber(),
  order_id: model.text().nullable(),
  channel: model.enum(["checkout", "in_store"]),
  redeemable: model.belongsTo(() => Redeemable, {
    mappedBy: "redemptions",
  }),
})

export default Redemption
```

- [ ] **Step 2: Service shell + module index**

`backend/src/modules/redeemables/service.ts`:

```ts
import { MedusaService } from "@medusajs/framework/utils"
import Redeemable from "./models/redeemable"
import Redemption from "./models/redemption"

class RedeemablesModuleService extends MedusaService({
  Redeemable,
  Redemption,
}) {}

export default RedeemablesModuleService
```

`backend/src/modules/redeemables/index.ts`:

```ts
import { Module } from "@medusajs/framework/utils"
import RedeemablesModuleService from "./service"

export const REDEEMABLES_MODULE = "redeemables"

export default Module(REDEEMABLES_MODULE, {
  service: RedeemablesModuleService,
})
```

- [ ] **Step 3: Register in `backend/medusa-config.ts`** — in the `modules`
array, directly after `{ resolve: "./src/modules/ai" },` add:

```ts
    {
      resolve: "./src/modules/redeemables",
    },
```

- [ ] **Step 4: Generate + run the migration** (background, Tee-Object — can
take minutes):

```powershell
Set-Location c:\Users\mosho\Desktop\howsyou\backend
npx medusa db:generate redeemables 2>&1 | Tee-Object -FilePath $env:TEMP\p7-dbgen.log
npx medusa db:migrate 2>&1 | Tee-Object -FilePath $env:TEMP\p7-dbmigrate.log
```

Expected: a new `Migration*.ts` under `src/modules/redeemables/migrations/`
creating tables `redeemable` and `redemption`; migrate applies cleanly.

- [ ] **Step 5: Verify** — `npx tsc --noEmit` clean; `/health` still 200 on
the dev server.

- [ ] **Step 6: Commit**

```bash
git add backend/src/modules/redeemables backend/medusa-config.ts
git commit -m "feat(redeemables): module scaffold — Redeemable + Redemption models"
```

---

## Task 2 — Service logic: codes, minting, semantics, both redemption doors

**Files:**
- Modify: `backend/src/modules/redeemables/service.ts` (replace shell)

- [ ] **Step 1: Implement the full service.** Replace the shell with:

```ts
import { randomBytes } from "node:crypto"
import { MedusaError, MedusaService } from "@medusajs/framework/utils"
import Redeemable from "./models/redeemable"
import Redemption from "./models/redemption"

export type RedeemableType = "gift_card" | "voucher" | "ticket"

export type MintInput = {
  seller_id: string
  type: RedeemableType
  title: string
  currency_code?: string
  face_value?: number
  discount_type?: "fixed" | "percent"
  discount_value?: number
  price?: number
  product_id?: string
  expires_at?: Date
  issued_to_email?: string
  source_order_id?: string
}

// Unambiguous alphabet: no 0/O/1/I (and no L — reads as 1 in some fonts)
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"
const CODE_PREFIX: Record<RedeemableType, string> = {
  gift_card: "GC",
  voucher: "VC",
  ticket: "TK",
}

function generateCode(type: RedeemableType): string {
  const bytes = randomBytes(12)
  const chars = Array.from(
    bytes,
    (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]
  )
  const groups = [
    chars.slice(0, 4).join(""),
    chars.slice(4, 8).join(""),
    chars.slice(8, 12).join(""),
  ]
  return `${CODE_PREFIX[type]}-${groups.join("-")}`
}

class RedeemablesModuleService extends MedusaService({
  Redeemable,
  Redemption,
}) {
  // ── creation ────────────────────────────────────────────────────────────

  /** Validates per-type rules and mints `quantity` coded instances. */
  async mintRedeemables(input: MintInput, quantity = 1) {
    if (quantity < 1 || quantity > 100) {
      throw new MedusaError(
        MedusaError.Types.NOT_ALLOWED,
        "quantity must be between 1 and 100"
      )
    }
    if (input.type === "voucher") {
      if (!input.discount_type || !input.discount_value) {
        throw new MedusaError(
          MedusaError.Types.NOT_ALLOWED,
          "Vouchers need discount_type and discount_value"
        )
      }
      if (
        input.discount_type === "percent" &&
        (input.discount_value <= 0 || input.discount_value > 100)
      ) {
        throw new MedusaError(
          MedusaError.Types.NOT_ALLOWED,
          "Percent vouchers must be between 1 and 100"
        )
      }
    } else if (!input.face_value || input.face_value <= 0) {
      throw new MedusaError(
        MedusaError.Types.NOT_ALLOWED,
        `${input.type === "gift_card" ? "Gift cards" : "Tickets"} need a positive face_value`
      )
    }

    const rows = Array.from({ length: quantity }, () => ({
      seller_id: input.seller_id,
      type: input.type,
      code: generateCode(input.type),
      currency_code: input.currency_code ?? "ngn",
      title: input.title,
      face_value: input.face_value ?? null,
      balance: input.type === "gift_card" ? input.face_value : null,
      discount_type: input.discount_type ?? null,
      discount_value: input.discount_value ?? null,
      price: input.price ?? null,
      product_id: input.product_id ?? null,
      expires_at: input.expires_at ?? null,
      issued_to_email: input.issued_to_email ?? null,
      source_order_id: input.source_order_id ?? null,
    }))
    return await this.createRedeemables(rows)
  }

  /** A sold template mints a FRESH instance per unit to the buyer. */
  async mintFromTemplate(
    templateId: string,
    opts: { quantity: number; issued_to_email?: string; source_order_id: string }
  ) {
    const template = await this.retrieveRedeemable(templateId)
    return await this.mintRedeemables(
      {
        seller_id: template.seller_id,
        type: template.type as RedeemableType,
        title: template.title,
        currency_code: template.currency_code,
        face_value: template.face_value
          ? Number(template.face_value)
          : undefined,
        discount_type:
          (template.discount_type as "fixed" | "percent") ?? undefined,
        discount_value: template.discount_value ?? undefined,
        expires_at: template.expires_at ?? undefined,
        issued_to_email: opts.issued_to_email,
        source_order_id: opts.source_order_id,
      },
      opts.quantity
    )
  }

  // ── lookup & validation ─────────────────────────────────────────────────

  /**
   * Fetches by code with lazy expiry, optional seller scoping (foreign codes
   * are invisible — 404, never 400) and a usability gate.
   */
  async getUsableByCode(code: string, opts: { seller_id?: string } = {}) {
    const [redeemable] = await this.listRedeemables({ code })
    if (
      !redeemable ||
      (opts.seller_id && redeemable.seller_id !== opts.seller_id)
    ) {
      throw new MedusaError(MedusaError.Types.NOT_FOUND, "Code not found")
    }
    if (
      redeemable.status === "active" &&
      redeemable.expires_at &&
      new Date(redeemable.expires_at).getTime() < Date.now()
    ) {
      const [expired] = await this.updateRedeemables([
        { id: redeemable.id, status: "expired" },
      ])
      throw new MedusaError(
        MedusaError.Types.NOT_ALLOWED,
        `This code expired on ${new Date(expired.expires_at!).toDateString()}`
      )
    }
    if (redeemable.status !== "active") {
      throw new MedusaError(
        MedusaError.Types.NOT_ALLOWED,
        `This code is already ${redeemable.status}`
      )
    }
    return redeemable
  }

  /** ₦ a code is worth against an order/cart total. Tickets: venue only. */
  checkoutAmountFor(
    redeemable: { type: string; balance?: unknown; discount_type?: string | null; discount_value?: number | null },
    total: number
  ): number {
    if (redeemable.type === "ticket") {
      throw new MedusaError(
        MedusaError.Types.NOT_ALLOWED,
        "Tickets are redeemed at the venue — show the code or QR at the door"
      )
    }
    if (redeemable.type === "gift_card") {
      return Math.min(Number(redeemable.balance), total)
    }
    return redeemable.discount_type === "percent"
      ? Math.round((total * (redeemable.discount_value ?? 0)) / 100)
      : Math.min(redeemable.discount_value ?? 0, total)
  }

  // ── redemption doors ────────────────────────────────────────────────────

  /** Checkout door: draw down / consume + audit row. */
  async consumeAtCheckout(
    code: string,
    opts: { order_total: number; order_id?: string }
  ) {
    const redeemable = await this.getUsableByCode(code)
    const amount = this.checkoutAmountFor(redeemable, opts.order_total)
    if (amount <= 0) {
      throw new MedusaError(
        MedusaError.Types.NOT_ALLOWED,
        "This code has no value against this order"
      )
    }
    const updated = await this.applyDrawdown(redeemable, amount)
    const [redemption] = await this.createRedemptions([
      {
        redeemable_id: redeemable.id,
        amount_applied: amount,
        order_id: opts.order_id ?? null,
        channel: "checkout",
      },
    ])
    return { redeemable: updated, redemption, amount_applied: amount }
  }

  /** Compensation: checkout failed after consumption — put the value back. */
  async undoCheckoutConsumption(redemptionId: string) {
    const redemption = await this.retrieveRedemption(redemptionId)
    const redeemable = await this.retrieveRedeemable(redemption.redeemable_id)
    const restore =
      redeemable.type === "gift_card"
        ? {
            balance:
              Number(redeemable.balance ?? 0) +
              Number(redemption.amount_applied),
            status: "active" as const,
          }
        : { status: "active" as const }
    await this.updateRedeemables([{ id: redeemable.id, ...restore }])
    await this.deleteRedemptions([redemptionId])
  }

  /** In-store door: the owning seller redeems what the buyer shows. */
  async redeemInStore(
    code: string,
    sellerId: string,
    opts: { amount?: number } = {}
  ) {
    const redeemable = await this.getUsableByCode(code, {
      seller_id: sellerId,
    })

    let amount: number
    if (redeemable.type === "gift_card") {
      if (!opts.amount || opts.amount <= 0) {
        throw new MedusaError(
          MedusaError.Types.NOT_ALLOWED,
          "Gift card redemption needs the amount to draw down"
        )
      }
      if (opts.amount > Number(redeemable.balance)) {
        throw new MedusaError(
          MedusaError.Types.NOT_ALLOWED,
          `Only ${Number(redeemable.balance)} left on this card`
        )
      }
      amount = opts.amount
    } else if (redeemable.type === "ticket") {
      amount = Number(redeemable.face_value)
    } else {
      amount =
        redeemable.discount_type === "fixed"
          ? (redeemable.discount_value ?? 0)
          : 0 // percent voucher in-store: seller applies it on their own till
    }

    const updated = await this.applyDrawdown(redeemable, amount)
    const [redemption] = await this.createRedemptions([
      {
        redeemable_id: redeemable.id,
        amount_applied: amount,
        order_id: null,
        channel: "in_store",
      },
    ])
    return { redeemable: updated, redemption }
  }

  /** Seller cancels an own, still-active code. */
  async cancelRedeemable(id: string, sellerId: string) {
    const [redeemable] = await this.listRedeemables({ id })
    if (!redeemable || redeemable.seller_id !== sellerId) {
      throw new MedusaError(MedusaError.Types.NOT_FOUND, "Code not found")
    }
    if (redeemable.status !== "active") {
      throw new MedusaError(
        MedusaError.Types.NOT_ALLOWED,
        `Cannot cancel a ${redeemable.status} code`
      )
    }
    const [updated] = await this.updateRedeemables([
      { id, status: "cancelled" },
    ])
    return updated
  }

  // gift cards deplete; vouchers/tickets die on first use
  private async applyDrawdown(
    redeemable: { id: string; type: string; balance?: unknown },
    amount: number
  ) {
    const patch =
      redeemable.type === "gift_card"
        ? (() => {
            const newBalance = Number(redeemable.balance) - amount
            return {
              balance: newBalance,
              status: newBalance <= 0 ? ("redeemed" as const) : ("active" as const),
            }
          })()
        : { status: "redeemed" as const }
    const [updated] = await this.updateRedeemables([
      { id: redeemable.id, ...patch },
    ])
    return updated
  }
}

export default RedeemablesModuleService
```

- [ ] **Step 2: Verify** — `npx tsc --noEmit` clean.

- [ ] **Step 3: Commit**

```bash
git add backend/src/modules/redeemables/service.ts
git commit -m "feat(redeemables): mint/validate/redeem service with classic semantics"
```

---

## Task 3 — Seller APIs: create (+auto product for priced), list, redeem, cancel

**Files:**
- Create: `backend/src/api/sellers/redeemables/route.ts` (GET + POST)
- Create: `backend/src/api/sellers/redeemables/redeem/route.ts` (POST)
- Create: `backend/src/api/sellers/redeemables/[id]/cancel/route.ts` (POST)
- Modify: `backend/src/api/middlewares.ts` (3 schemas + 2 matchers)

Auth: the existing `/sellers/*` matcher already applies seller authentication.
Each route resolves the seller with the same inline `resolveSellerId` pattern
used by `sellers/payouts/route.ts` (seller_admin graph by
`req.auth_context.actor_id`).

- [ ] **Step 1: Schemas in `backend/src/api/middlewares.ts`** — after
`PostEscrowReleaseSchema` add:

```ts
// Redeemables (Phase 7): per-type field rules are enforced in the service
export const PostSellerRedeemableSchema = z.object({
  type: z.enum(["gift_card", "voucher", "ticket"]),
  title: z.string().min(2),
  face_value: z.number().positive().optional(),
  discount_type: z.enum(["fixed", "percent"]).optional(),
  discount_value: z.number().positive().optional(),
  price: z.number().positive().optional(),
  expires_at: z.coerce.date().optional(),
  quantity: z.number().int().min(1).max(100).default(1),
  issued_to_email: z.string().email().optional(),
})

export const PostRedeemInStoreSchema = z.object({
  code: z.string().min(6),
  amount: z.number().positive().optional(),
})

export const PostApplyRedeemableSchema = z.object({
  code: z.string().min(6),
})
```

And in the `routes` array (before the paystack hooks entry):

```ts
    {
      matcher: "/sellers/redeemables",
      methods: ["POST"],
      middlewares: [validateAndTransformBody(PostSellerRedeemableSchema)],
    },
    {
      matcher: "/sellers/redeemables/redeem",
      methods: ["POST"],
      middlewares: [validateAndTransformBody(PostRedeemInStoreSchema)],
    },
    {
      matcher: "/store/carts/:id/apply-redeemable",
      methods: ["POST"],
      middlewares: [validateAndTransformBody(PostApplyRedeemableSchema)],
    },
```

- [ ] **Step 2: `backend/src/api/sellers/redeemables/route.ts`**

```ts
import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import {
  ContainerRegistrationKeys,
  MedusaError,
  Modules,
} from "@medusajs/framework/utils"
import { createProductsWorkflow } from "@medusajs/medusa/core-flows"
import { z } from "@medusajs/framework/zod"
import { REDEEMABLES_MODULE } from "../../../modules/redeemables"
import RedeemablesModuleService from "../../../modules/redeemables/service"
import { MARKETPLACE_MODULE } from "../../../modules/marketplace"
import { PostSellerRedeemableSchema } from "../../middlewares"

type PostBody = z.infer<typeof PostSellerRedeemableSchema>

async function resolveSellerId(
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

export const GET = async (
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) => {
  const sellerId = await resolveSellerId(req)
  const redeemables =
    req.scope.resolve<RedeemablesModuleService>(REDEEMABLES_MODULE)

  const filters: Record<string, unknown> = { seller_id: sellerId }
  if (typeof req.query.type === "string") filters.type = req.query.type
  if (typeof req.query.status === "string") filters.status = req.query.status

  const items = await redeemables.listRedeemables(filters, {
    order: { created_at: "DESC" },
  })
  res.json({ redeemables: items })
}

export const POST = async (
  req: AuthenticatedMedusaRequest<PostBody>,
  res: MedusaResponse
) => {
  const sellerId = await resolveSellerId(req)
  const body = req.validatedBody
  const redeemables =
    req.scope.resolve<RedeemablesModuleService>(REDEEMABLES_MODULE)

  // Priced ⇒ purchasable template: exactly one row; the linked product is
  // what buyers add to carts, and each sale mints a fresh coded instance.
  if (body.price && body.quantity !== 1) {
    throw new MedusaError(
      MedusaError.Types.NOT_ALLOWED,
      "Priced templates are single rows — sales mint instances per purchase"
    )
  }

  const minted = await redeemables.mintRedeemables(
    {
      seller_id: sellerId,
      type: body.type,
      title: body.title,
      face_value: body.face_value,
      discount_type: body.discount_type,
      discount_value: body.discount_value,
      price: body.price,
      expires_at: body.expires_at,
      issued_to_email: body.issued_to_email,
    },
    body.quantity
  )

  if (body.price) {
    const template = minted[0]
    const { result: [product] } = await createProductsWorkflow(req.scope).run({
      input: {
        products: [
          {
            title: body.title,
            status: "published",
            options: [{ title: "Default", values: ["Default"] }],
            variants: [
              {
                title: body.title,
                options: { Default: "Default" },
                manage_inventory: false,
                prices: [{ amount: body.price, currency_code: "ngn" }],
              },
            ],
            metadata: { redeemable_template_id: template.id },
          },
        ],
      },
    })

    const link = req.scope.resolve(ContainerRegistrationKeys.LINK)
    await link.create([
      {
        [MARKETPLACE_MODULE]: { seller_id: sellerId },
        [Modules.PRODUCT]: { product_id: product.id },
      },
    ])

    const [updated] = await redeemables.updateRedeemables([
      { id: template.id, product_id: product.id },
    ])
    res.status(201).json({ redeemables: [updated], product_id: product.id })
    return
  }

  res.status(201).json({ redeemables: minted })
}
```

- [ ] **Step 3: `backend/src/api/sellers/redeemables/redeem/route.ts`**

```ts
import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import {
  ContainerRegistrationKeys,
  MedusaError,
} from "@medusajs/framework/utils"
import { z } from "@medusajs/framework/zod"
import { REDEEMABLES_MODULE } from "../../../../modules/redeemables"
import RedeemablesModuleService from "../../../../modules/redeemables/service"
import { PostRedeemInStoreSchema } from "../../../middlewares"

type PostBody = z.infer<typeof PostRedeemInStoreSchema>

async function resolveSellerId(
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

// The buyer shows their code/QR; the seller's phone is the till. The
// response is the receipt: updated instrument + the redemption row.
export const POST = async (
  req: AuthenticatedMedusaRequest<PostBody>,
  res: MedusaResponse
) => {
  const sellerId = await resolveSellerId(req)
  const redeemables =
    req.scope.resolve<RedeemablesModuleService>(REDEEMABLES_MODULE)

  const result = await redeemables.redeemInStore(
    req.validatedBody.code,
    sellerId,
    { amount: req.validatedBody.amount }
  )
  res.json(result)
}
```

- [ ] **Step 4: `backend/src/api/sellers/redeemables/[id]/cancel/route.ts`**

```ts
import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import {
  ContainerRegistrationKeys,
  MedusaError,
} from "@medusajs/framework/utils"
import { REDEEMABLES_MODULE } from "../../../../../modules/redeemables"
import RedeemablesModuleService from "../../../../../modules/redeemables/service"

async function resolveSellerId(
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

export const POST = async (
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) => {
  const sellerId = await resolveSellerId(req)
  const redeemables =
    req.scope.resolve<RedeemablesModuleService>(REDEEMABLES_MODULE)

  const redeemable = await redeemables.cancelRedeemable(
    req.params.id,
    sellerId
  )
  res.json({ redeemable })
}
```

- [ ] **Step 5: Verify** — `npx tsc --noEmit` clean.

- [ ] **Step 6: Commit**

```bash
git add backend/src/api/sellers/redeemables backend/src/api/middlewares.ts
git commit -m "feat(redeemables): seller create/list/redeem/cancel APIs with priced templates"
```

---

## Task 4 — Store APIs: storefront handle, public code check, cart apply

**Files:**
- Create: `backend/src/api/store/sellers/[handle]/route.ts` (GET)
- Create: `backend/src/api/store/redeemables/[code]/route.ts` (GET)
- Create: `backend/src/api/store/carts/[id]/apply-redeemable/route.ts` (POST)

All three are `/store/*` routes — the framework already demands the
publishable key; the apply matcher + schema were added in Task 3.

- [ ] **Step 1: `backend/src/api/store/sellers/[handle]/route.ts`**

```ts
import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import {
  ContainerRegistrationKeys,
  MedusaError,
} from "@medusajs/framework/utils"
import { REDEEMABLES_MODULE } from "../../../../modules/redeemables"
import RedeemablesModuleService from "../../../../modules/redeemables/service"

// The seller's public front door: /store/<handle> renders this. Profile +
// published products + instruments listed FOR SALE (never their codes —
// codes are bearer instruments, bought or gifted, never read off a page).
export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const { data: [seller] } = await query.graph({
    entity: "seller",
    fields: [
      "id",
      "name",
      "handle",
      "logo",
      "description",
      "verification_status",
      "products.*",
    ],
    filters: { handle: req.params.handle },
  })
  if (!seller) {
    throw new MedusaError(MedusaError.Types.NOT_FOUND, "Store not found")
  }

  const redeemablesModule =
    req.scope.resolve<RedeemablesModuleService>(REDEEMABLES_MODULE)
  const active = await redeemablesModule.listRedeemables({
    seller_id: seller.id,
    status: "active",
    price: { $ne: null },
  })
  const now = Date.now()
  const forSale = active
    .filter((r) => !r.expires_at || new Date(r.expires_at).getTime() > now)
    .map(({ code: _code, seller_id: _sid, ...publicFields }) => publicFields)

  res.json({
    seller: {
      name: seller.name,
      handle: seller.handle,
      logo: seller.logo,
      description: seller.description,
      verification_status: seller.verification_status,
    },
    products: (seller.products ?? [])
      .filter((p) => p?.status === "published")
      .map((p) => ({
        id: p!.id,
        title: p!.title,
        handle: p!.handle,
        thumbnail: p!.thumbnail ?? null,
      })),
    redeemables: forSale,
  })
}
```

- [ ] **Step 2: `backend/src/api/store/redeemables/[code]/route.ts`**

```ts
import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { REDEEMABLES_MODULE } from "../../../../modules/redeemables"
import RedeemablesModuleService from "../../../../modules/redeemables/service"

// Public validity check — what the buyer's (or door staff's) phone shows.
// Unknown codes 404, dead/expired codes 400, via the shared error mapping.
export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
  const redeemables =
    req.scope.resolve<RedeemablesModuleService>(REDEEMABLES_MODULE)
  const redeemable = await redeemables.getUsableByCode(req.params.code)

  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const { data: [seller] } = await query.graph({
    entity: "seller",
    fields: ["name", "handle"],
    filters: { id: redeemable.seller_id },
  })

  res.json({
    redeemable: {
      type: redeemable.type,
      title: redeemable.title,
      status: redeemable.status,
      currency_code: redeemable.currency_code,
      face_value: redeemable.face_value,
      balance: redeemable.balance,
      discount_type: redeemable.discount_type,
      discount_value: redeemable.discount_value,
      expires_at: redeemable.expires_at,
      qr_payload: redeemable.code,
      store: seller ? { name: seller.name, handle: seller.handle } : null,
    },
  })
}
```

- [ ] **Step 3: `backend/src/api/store/carts/[id]/apply-redeemable/route.ts`**

Store-scope rule: the code applies only when **every** cart item belongs to
the code's store (carts here are effectively single-store; mixed carts get a
clear 400). The discount lands as line-item adjustments so the payment
collection created afterwards charges the reduced total — apply **before**
initiating payment. Re-applying replaces the previous code (`set`, not `add`)
— that's also the "remove and retry" path when a code dies between apply and
complete.

```ts
import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import {
  ContainerRegistrationKeys,
  MedusaError,
  Modules,
  promiseAll,
} from "@medusajs/framework/utils"
import { z } from "@medusajs/framework/zod"
import { REDEEMABLES_MODULE } from "../../../../../modules/redeemables"
import RedeemablesModuleService from "../../../../../modules/redeemables/service"
import { PostApplyRedeemableSchema } from "../../../../middlewares"

type PostBody = z.infer<typeof PostApplyRedeemableSchema>

export const POST = async (
  req: MedusaRequest<PostBody>,
  res: MedusaResponse
) => {
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const { data: [cart] } = await query.graph({
    entity: "cart",
    fields: [
      "id",
      "metadata",
      "items.id",
      "items.subtotal",
      "items.product_id",
    ],
    filters: { id: req.params.id },
  })
  if (!cart || !cart.items?.length) {
    throw new MedusaError(MedusaError.Types.NOT_FOUND, "Cart not found")
  }

  const redeemables =
    req.scope.resolve<RedeemablesModuleService>(REDEEMABLES_MODULE)
  const redeemable = await redeemables.getUsableByCode(req.validatedBody.code)

  // store-scoped, always: every item must belong to the code's store
  await promiseAll(
    cart.items.map(async (item) => {
      const { data: [product] } = await query.graph({
        entity: "product",
        fields: ["id", "seller.*"],
        filters: { id: item?.product_id || "" },
      })
      if (product?.seller?.id !== redeemable.seller_id) {
        throw new MedusaError(
          MedusaError.Types.NOT_ALLOWED,
          "This code only works at its issuing store — remove other stores' items first"
        )
      }
    })
  )

  const base = cart.items.reduce(
    (sum, item) => sum + Number(item?.subtotal ?? 0),
    0
  )
  const amount = redeemables.checkoutAmountFor(redeemable, base)
  if (amount <= 0) {
    throw new MedusaError(
      MedusaError.Types.NOT_ALLOWED,
      "This code has no value against this cart"
    )
  }

  // greedy allocation, capped per item
  let remaining = amount
  const adjustments: {
    item_id: string
    amount: number
    code: string
    description: string
  }[] = []
  for (const item of cart.items) {
    if (!item || remaining <= 0) {
      continue
    }
    const take = Math.min(Number(item.subtotal ?? 0), remaining)
    if (take > 0) {
      adjustments.push({
        item_id: item.id,
        amount: take,
        code: redeemable.code,
        description: redeemable.title,
      })
      remaining -= take
    }
  }

  const cartModule = req.scope.resolve(Modules.CART)
  await cartModule.setLineItemAdjustments(cart.id, adjustments)
  await cartModule.updateCarts([
    {
      id: cart.id,
      metadata: {
        ...(cart.metadata ?? {}),
        redeemable_code: redeemable.code,
        redeemable_amount: amount,
        redeemable_base_total: base,
      },
    },
  ])

  res.json({
    cart_id: cart.id,
    code: redeemable.code,
    amount_applied: amount,
  })
}
```

- [ ] **Step 4: Verify** — `npx tsc --noEmit` clean.

- [ ] **Step 5: Commit**

```bash
git add backend/src/api/store
git commit -m "feat(redeemables): public storefront, code check and cart-apply APIs"
```

---

## Task 5 — Checkout seam: consume on complete + minting/instant-release subscriber

**Files:**
- Modify: `backend/src/api/store/carts/[id]/complete-marketplace/route.ts`
- Create: `backend/src/subscribers/redeemables-order-placed.ts`

- [ ] **Step 1: Rewrite `complete-marketplace/route.ts`.** Consume the applied
code **before** the workflow (a dead code fails checkout with a clear 400
before any order exists); undo the consumption if the workflow fails; backfill
the redemption's `order_id` on success:

```ts
import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import createSellerOrdersWorkflow from "../../../../../workflows/marketplace/create-seller-orders"
import { REDEEMABLES_MODULE } from "../../../../../modules/redeemables"
import RedeemablesModuleService from "../../../../../modules/redeemables/service"

export const POST = async (
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) => {
  const cartId = req.params.id
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const redeemables =
    req.scope.resolve<RedeemablesModuleService>(REDEEMABLES_MODULE)

  const { data: [cart] } = await query.graph({
    entity: "cart",
    fields: ["id", "total", "metadata"],
    filters: { id: cartId },
  })
  const code = cart?.metadata?.redeemable_code as string | undefined

  // consume first — the buyer must never be charged against a dead code;
  // the value comes back (compensation below) if anything downstream fails
  let consumption:
    | Awaited<ReturnType<RedeemablesModuleService["consumeAtCheckout"]>>
    | undefined
  if (code) {
    consumption = await redeemables.consumeAtCheckout(code, {
      order_total: Number(
        cart?.metadata?.redeemable_base_total ?? cart?.total ?? 0
      ),
    })
  }

  try {
    const { result } = await createSellerOrdersWorkflow(req.scope).run({
      input: {
        cart_id: cartId,
      },
    })

    if (consumption) {
      await redeemables.updateRedemptions([
        { id: consumption.redemption.id, order_id: result.order.id },
      ])
    }

    res.json({
      type: "order",
      order: result.order,
      ...(consumption
        ? { redeemable_applied: consumption.amount_applied }
        : {}),
    })
  } catch (e) {
    if (consumption) {
      await redeemables.undoCheckoutConsumption(consumption.redemption.id)
    }
    throw e
  }
}
```

- [ ] **Step 2: `backend/src/subscribers/redeemables-order-placed.ts`.**
`order.placed` fires for the parent order once the whole create-seller-orders
transaction commits (commission lines already written — Medusa buffers events
by group and flushes on completion). Child seller orders are skipped via
`metadata.parent_order_id`; `resolveLinesForOrder` on the parent reaches their
lines either way. Idempotency marker: instruments already minted with this
`source_order_id`.

```ts
import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import {
  ContainerRegistrationKeys,
  OrderWorkflowEvents,
} from "@medusajs/framework/utils"
import { REDEEMABLES_MODULE } from "../modules/redeemables"
import RedeemablesModuleService from "../modules/redeemables/service"
import { MARKETPLACE_MODULE } from "../modules/marketplace"
import MarketplaceModuleService from "../modules/marketplace/service"

// Sold instruments come to life here: each purchased template unit mints a
// fresh coded instance addressed to the buyer, and redeemable-only seller
// orders release escrow instantly (locked Phase 7 decision). Failures are
// logged, never thrown — the order itself must always survive.
export default async function redeemablesOrderPlacedHandler({
  event: { data },
  container,
}: SubscriberArgs<{ id: string }>) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  try {
    const query = container.resolve(ContainerRegistrationKeys.QUERY)
    const { data: [order] } = await query.graph({
      entity: "order",
      fields: [
        "id",
        "email",
        "metadata",
        "items.quantity",
        "items.product_id",
      ],
      filters: { id: data.id },
    })
    if (!order || order.metadata?.parent_order_id) {
      return // child seller orders ride their parent's event
    }

    const redeemables =
      container.resolve<RedeemablesModuleService>(REDEEMABLES_MODULE)

    const already = await redeemables.listRedeemables({
      source_order_id: order.id,
    })
    if (already.length) {
      return // replayed event — never double-mint
    }

    // each item → owning seller + template linkage (if it is one)
    type ItemInfo = {
      seller_id?: string
      template_id?: string
      quantity: number
    }
    const infos: ItemInfo[] = []
    for (const item of order.items ?? []) {
      if (!item?.product_id) {
        continue
      }
      const { data: [product] } = await query.graph({
        entity: "product",
        fields: ["id", "metadata", "seller.*"],
        filters: { id: item.product_id },
      })
      infos.push({
        seller_id: product?.seller?.id,
        template_id: product?.metadata?.redeemable_template_id as
          | string
          | undefined,
        quantity: Number(item.quantity ?? 1),
      })
    }

    for (const info of infos) {
      if (info.template_id) {
        await redeemables.mintFromTemplate(info.template_id, {
          quantity: info.quantity,
          issued_to_email: order.email ?? undefined,
          source_order_id: order.id,
        })
      }
    }

    // instant release: a seller order made ONLY of redeemables has nothing
    // to deliver — its money goes available now; mixed orders keep the
    // normal Phase 6 escrow window
    const marketplace =
      container.resolve<MarketplaceModuleService>(MARKETPLACE_MODULE)
    const lines = await marketplace.resolveLinesForOrder(order.id)
    for (const line of lines) {
      const sellerItems = infos.filter((i) => i.seller_id === line.seller_id)
      if (sellerItems.length && sellerItems.every((i) => i.template_id)) {
        await marketplace.confirmOrderReceipt(line.order_id)
      }
    }
  } catch (e) {
    logger.warn(
      `redeemables order.placed handling failed for ${data.id}: ${e}`
    )
  }
}

export const config: SubscriberConfig = {
  event: OrderWorkflowEvents.PLACED,
}
```

- [ ] **Step 3: Verify** — `npx tsc --noEmit` clean.

- [ ] **Step 4: Commit**

```bash
git add backend/src/api/store/carts backend/src/subscribers/redeemables-order-placed.ts
git commit -m "feat(redeemables): checkout consumption + sold-template minting and instant release"
```

---

## Task 6 — Integration tests: `redeemables.spec.ts`

**Files:**
- Create: `backend/integration-tests/http/redeemables.spec.ts`

Conventions from `escrow.spec.ts`: runner `inApp`, publishable key minted via
`Modules.API_KEY`, orders/carts seeded via modules + LINK, `dbUtils.snapshot()`
after `beforeAll`, axios rejects on non-2xx. No prior spec completes a real
cart over HTTP (Phase 4 note) — the checkout-consume seam is proven at
service level here and over HTTP in the Task 7 live proof; the subscriber is
invoked directly with the test container (same reasoning as Phase 6's
subscribers, but this one carries money logic, so it IS tested here).

- [ ] **Step 1: Write the spec.** Skeleton (write it out fully — every `it`
below is a real test):

```ts
import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
import {
  ContainerRegistrationKeys,
  Modules,
} from "@medusajs/framework/utils"
import { MARKETPLACE_MODULE } from "../../src/modules/marketplace"
import MarketplaceModuleService from "../../src/modules/marketplace/service"
import { REDEEMABLES_MODULE } from "../../src/modules/redeemables"
import RedeemablesModuleService from "../../src/modules/redeemables/service"
import redeemablesOrderPlacedHandler from "../../src/subscribers/redeemables-order-placed"

jest.setTimeout(120 * 1000)

process.env.PAYSTACK_SECRET_KEY = "mock"
process.env.CIRCLE_API_KEY = "mock"
process.env.CRYPTO_ENABLED = "true"
process.env.ESCROW_RETURN_WINDOW_DAYS = "3"
process.env.ESCROW_FALLBACK_RELEASE_DAYS = "30"
process.env.PAYOUT_MIN_NGN = "1"
process.env.PAYOUT_SCHEDULE_ENABLED = "false"

medusaIntegrationTestRunner({
  inApp: true,
  env: {},
  testSuite: ({ api, getContainer, dbUtils }) => {
    describe("Redeemables — storefront, instruments & redemption", () => {
      let redeemables: RedeemablesModuleService
      let marketplace: MarketplaceModuleService
      let token: string
      let sellerId: string
      let productId: string
      let storeHeaders: { headers: Record<string, string> }

      const auth = () => ({ headers: { Authorization: `Bearer ${token}` } })

      // POST /sellers/redeemables shorthand
      const mint = (body: Record<string, unknown>) =>
        api.post("/sellers/redeemables", body, auth())

      const seedCart = async (opts: { product_id: string; unit_price?: number }) => {
        const cartModule = getContainer().resolve(Modules.CART)
        return await cartModule.createCarts({
          currency_code: "ngn",
          email: "buyer@howsu.local",
          items: [
            {
              title: "Cart item",
              quantity: 1,
              unit_price: opts.unit_price ?? 10000,
              product_id: opts.product_id,
            },
          ],
        })
      }

      beforeAll(async () => {
        // onboard redeemables-seller@howsu.local / handle "redeemables-seller"
        // (register → POST /sellers → login) exactly like escrow.spec
        // + mint publishable key into storeHeaders
        // + seed one published product "Ankara Shirt" owned by the seller
        //   (Modules.PRODUCT createProducts + LINK seller-product)
        // + resolve `redeemables` and `marketplace` from the container
        // + await dbUtils.snapshot()
      })

      it("storefront resolves a handle to profile, products and for-sale instruments (codes stripped)", async () => {
        // priced template first: POST { type: "voucher", title: "20% Off",
        //   discount_type: "percent", discount_value: 20, price: 500 }
        //   → 201 + product_id in response
        // GET /store/sellers/redeemables-seller (storeHeaders) → seller
        //   {name, handle, verification_status: "unverified"}, products
        //   includes "Ankara Shirt", redeemables[0] has price 500 and NO
        //   `code`/`seller_id` keys (expect(r.code).toBeUndefined())
        // GET /store/sellers/no-such-store → 404
      })

      it("free-issues a batch of distinct prefixed codes", async () => {
        // POST voucher fixed 1000, quantity 3 → three VC- codes, all unique
        // POST gift_card face_value 5000 → balance equals face_value, GC-
        // POST ticket face_value 2000 → TK- prefix
      })

      it("rejects bad create payloads per type", async () => {
        // voucher without discount_* → 400; gift_card without face_value →
        // 400; percent voucher discount_value 150 → 400; priced template
        // with quantity 2 → 400
      })

      it("publicly checks a code and hides what it must", async () => {
        // gift card → GET /store/redeemables/:code (storeHeaders) →
        //   qr_payload = code, store.handle = "redeemables-seller",
        //   no seller_id in payload
        // GET /store/redeemables/GC-NOPE-NOPE-NOPE → 404
      })

      it("draws a gift card down across two in-store redemptions to zero", async () => {
        // mint 10000 → POST /sellers/redeemables/redeem {code, amount: 4000}
        //   → status active, balance 6000, redemption.amount_applied 4000,
        //   redemption.channel "in_store"
        // redeem {amount: 6000} → status redeemed, balance 0
        // redeem again → 400 ("already redeemed")
        // separate card: redeem {amount: 12000} → 400 ("Only ... left");
        //   redeem with no amount → 400
      })

      it("kills a voucher on first use and a ticket at the door", async () => {
        // fixed 1500 voucher → redeem → amount_applied 1500, redeemed;
        //   replay → 400
        // ticket face 2000 → redeem → amount_applied 2000, redeemed;
        //   replay → 400
      })

      it("hides foreign codes from other sellers", async () => {
        // onboard redeemables-intruder@howsu.local (like escrow.spec's
        // intruder) → redeem our gift card code → 404; cancel our id → 404
      })

      it("blocks expired codes lazily", async () => {
        // service-mint gift card with expires_at yesterday (mintRedeemables
        // via container to set the past date) → in-store redeem → 400
        // containing "expired"; listRedeemables shows status "expired"
      })

      it("cancels an active code and keeps it dead", async () => {
        // POST /sellers/redeemables/:id/cancel → cancelled
        // redeem → 400; cancel again → 400
      })

      it("applies a code to a cart as adjustments + metadata", async () => {
        // gift card 6000; cart with own product @10000 → POST
        //   /store/carts/:id/apply-redeemable {code} (storeHeaders) →
        //   amount_applied 6000
        // query.graph cart: metadata.redeemable_code set,
        //   redeemable_base_total 10000; items.adjustments[0].amount 6000
        //   with code
        // ticket code on a fresh cart → 400 ("venue")
      })

      it("keeps codes store-scoped at apply time", async () => {
        // intruder seeds own product; cart with intruder's product → apply
        // our voucher → 400 ("issuing store")
      })

      it("consumes and restores value at the checkout seam", async () => {
        // service level: percent 20 voucher → consumeAtCheckout(code,
        //   {order_total: 10000}) → amount_applied 2000, redemption row,
        //   status redeemed
        // undoCheckoutConsumption(redemption.id) → active again, redemption
        //   gone (listRedemptions by id → empty)
        // gift card 8000 vs total 5000 → amount_applied 5000, balance 3000
        // consuming a cancelled code → rejects NOT_ALLOWED
      })

      it("mints sold instruments and releases redeemable-only escrow on order.placed", async () => {
        // priced ticket template (price 3000, face 3000) via HTTP → template
        //   + auto product (metadata.redeemable_template_id, seller-linked)
        // seed order via Modules.ORDER: email buyer2@howsu.local, items
        //   [{product_id: that product, quantity: 2, unit_price: 3000}] +
        //   seller-order LINK + commission line (pending,
        //   parent_order_id = order.id) — escrow.spec's seedOrder shape
        // await redeemablesOrderPlacedHandler({ event: { data: { id:
        //   order.id }, name: "order.placed" }, container: getContainer() }
        //   as never)
        // → 2 fresh TK- instruments, issued_to_email buyer2@howsu.local,
        //   source_order_id = order.id, codes ≠ template code
        // → commission line status "available" (instant release)
        // replay the handler → still exactly 2 (idempotent)
      })

      it("keeps mixed orders in normal escrow", async () => {
        // order with template product + normal product, one line →
        // handler → instruments minted for the template item BUT line stays
        // "pending" (not all items redeemable)
      })

      it("keeps /health 200 (no regression)", async () => {
        const res = await api.get("/health")
        expect(res.status).toEqual(200)
      })
    })
  },
})
```

- [ ] **Step 2: Run it** (Jest invocation from the conventions block, path
`integration-tests/http/redeemables.spec.ts`) — all green. Debug with the
systematic-debugging skill if anything fails; known traps from Phase 6:
reversed/excluded balance buckets, `Maybe<T>` typings from query.graph
(drop explicit callback annotations), axios non-2xx rejects.

- [ ] **Step 3: Full suite** — all 7 spec files green (same invocation with
path `integration-tests/http`).

- [ ] **Step 4: Commit**

```bash
git add backend/integration-tests/http/redeemables.spec.ts
git commit -m "test(redeemables): storefront, instruments, redemption and checkout-seam spec"
```

---

## Task 7 — Live proof (mock mode, dev server)

Dev server on port 9000 (background watcher terminal, mock keys in `.env`).
Same ritual as Phases 5–6: temp `medusa exec` seed script
(`backend/src/scripts/phase7-proof-seed.ts`) + fetch driver
(`backend/.phase7-proof.tmp.js` with a shared
`.phase7-proof-state.tmp.json`). Capture raw JSON for every step. Delete all
temp artifacts afterwards (wait for the watcher reload, `/health` 200). **No
commit.**

- [ ] **Step 1: Onboard** a proof seller over HTTP:
`redeemables-proof-<ts>@howsu.local`, handle `redeemables-proof-<ts>`, bank
`058/0123456789` (mock-verified).

- [ ] **Step 2: Create instruments over HTTP** (seller JWT):
- gift card ₦10,000 (free issue) → `GC-` code, balance 10000
- fixed ₦1,000 voucher, quantity 2 → two distinct `VC-` codes
- **priced** 20%-off voucher template @ ₦500 → response carries
  `product_id` (auto-created published product, seller-linked)
- ticket ₦5,000 (free issue) → `TK-` code

- [ ] **Step 3: Storefront front door** — `GET /store/sellers/<handle>`
(publishable key from the seed script): profile + the template listed with
price but **no `code` key**; `GET /store/sellers/does-not-exist` → 404.

- [ ] **Step 4: Public code check** — `GET /store/redeemables/<GC code>` →
qr_payload + store handle; a made-up code → 404.

- [ ] **Step 5: In-store redemptions** (seller JWT):
- gift card: redeem ₦4,000 → balance 6000; redeem ₦6,000 → redeemed/0;
  replay → 400
- voucher #1: redeem → redeemed; replay → 400
- ticket: redeem → amount_applied 5000; replay → 400

- [ ] **Step 6: Cart apply + checkout consume seam.** Seed script creates a
normal product for the seller and a cart (Modules.CART, buyer email, that
product @ ₦10,000). Driver: apply voucher #2 → `amount_applied: 1000`; then
`POST /store/carts/<id>/complete-marketplace`. Two acceptable outcomes, both
proven by the follow-up check:
- order created → response has `redeemable_applied: 1000`, voucher redeemed
  (public check → 400 "already redeemed")
- core cart completion rejects the unpaid cart → the undo compensation must
  have run: public check shows the voucher **still active** (value restored)
Record whichever occurred verbatim — the seam (consume-then-undo) is what's
under proof; full paid checkout arrives with the frontend phase.

- [ ] **Step 7: Cancel** — cancel an unredeemed code → cancelled; public
check → 400.

- [ ] **Step 8: Cleanup** — delete the three temp files, wait for watcher
reload, `/health` 200, `git status` clean of temp artifacts.

---

## Task 8 — README section + full suite green

**Files:**
- Modify: `README.md` (root)

- [ ] **Step 1: Append a `## Store Identity & Redeemables (Phase 7)` section**
after the Phase 6 section, covering:
- The front door: `GET /store/sellers/:handle` → profile + products +
  for-sale instruments (bearer codes never exposed publicly)
- The `redeemables` module (third custom module): `Redeemable` + `Redemption`
  models; classic semantics table (gift card draws down / voucher one-shot /
  ticket door-only); `GC-`/`VC-`/`TK-` unguessable codes, QR = code payload
- Creation & sale: free issuance vs priced templates (auto-created linked
  product; each sale mints a fresh instance to the buyer's email);
  commission at purchase; **instant escrow release** for redeemable-only
  seller orders (mixed orders keep the Phase 6 window); admin
  reversal/clawback as the dispute backstop
- Two redemption doors: cart apply (adjustments, store-scoped, one code per
  cart, apply before payment) + consume-on-complete with undo compensation;
  seller in-store redeem by code/QR
- API table: the 7 endpoints from the spec (§5)
- Testing note: `redeemables.spec.ts` + live-proof ritual; update the Phase 6
  section's suite line and state the new totals (7 spec files, N tests)

- [ ] **Step 2: Full suite verbatim** — run the whole
`integration-tests/http` suite; paste the closing `Test Suites / Tests`
lines into the completion summary.

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs(redeemables): Phase 7 store identity & redeemables section"
```

---

## Verification checklist (whole phase)

- [ ] `npx tsc --noEmit` clean after every task
- [ ] `redeemables.spec.ts` green; full suite (7 files) green
- [ ] Live proof captured raw JSON for storefront, create, check, in-store
      redeem, apply, consume/undo, cancel — temp artifacts deleted
- [ ] Commits: one per task (6 code/test commits + 1 docs commit), plan
      committed beforehand
- [ ] Codes never leak on public surfaces; store-scope enforced on every door


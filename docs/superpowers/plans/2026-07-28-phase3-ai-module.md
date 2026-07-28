# Phase 3: AI Module ("one brain, many memories") Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Platform-owned AI for sellers — provider abstraction (Vercel AI SDK), per-seller hard isolation, 5 launch capabilities (listing writer, pricing advisor, business insights, accounting summary, marketing coach), and a per-seller monthly quota system — where AI failures never block commerce.

**Architecture:** A custom `ai` Medusa module owns the quota/usage ledger (data only — Medusa modules are isolated and cannot query other modules). All cross-module context building (seller's products/orders/commissions via query.graph) happens in API routes under `/sellers/ai/*`, which are protected by the existing seller `authenticate` middleware. A pure lib layer (`src/lib/ai/`) holds the provider factory (Groq / mock / mock-fail via env), capability prompt builders with Zod output schemas, seller context builders, and a shared route guard that maps quota exhaustion → friendly 429 and any provider failure → friendly 503.

**Tech Stack:** Medusa v2.18.0, Vercel AI SDK v5 (`ai`), `@ai-sdk/groq` (Groq free tier; model swap via env), Zod, existing Postgres/Redis via Docker.

**Environment facts (unchanged from Phase 2):**
- Windows PowerShell 5.1: `;` separator, NEVER `&&`. Workspace path contains an apostrophe — always double-quote `"C:\Users\mosho\Desktop\How's you"`.
- ALL `medusa db:*` commands run FROM THE JUNCTION: `cd C:\Users\mosho\howsu-link\backend` with `$env:NODE_OPTIONS="--preserve-symlinks --preserve-symlinks-main"`. A harmless post-migration TypeError from the inventory module may appear — acceptable ONLY if the migration lines succeeded first.
- Integration tests use the subst-drive + realpath-alias procedure proven in Phase 2 (see Task 5 Step 3).
- Dev server runs in background on :9000; kill ONLY backend-owned node processes (identify via `Get-CimInstance Win32_Process` CommandLine).
- No GROQ_API_KEY exists yet. Dev default is `AI_PROVIDER=mock` (deterministic canned outputs). Switching to live Groq later = set `AI_PROVIDER=groq` + `GROQ_API_KEY` in `.env`. Provider-down behavior is verified via `mock-fail`.

---

### Task 1: AI module — dependencies, env, models, service, registration, migration

**Files:**
- Modify: `backend/package.json` (via npm install)
- Modify: `backend/.env` (+ `backend/.env.template` if it exists)
- Create: `backend/src/modules/ai/models/ai-usage.ts`
- Create: `backend/src/modules/ai/models/ai-quota.ts`
- Create: `backend/src/modules/ai/service.ts`
- Create: `backend/src/modules/ai/index.ts`
- Modify: `backend/medusa-config.ts`
- Create (generated): `backend/src/modules/ai/migrations/Migration*.ts`

- [ ] **Step 1: Install dependencies**

```powershell
cd "C:\Users\mosho\Desktop\How's you\backend"; npm install ai@^5.0.0 "@ai-sdk/groq@^2.0.0" zod@^3.25.76 --save
```

Expected: 3 packages added to `dependencies`. (`zod@^3.25.76` satisfies both the AI SDK peer range and Medusa's `^3.22.x` range, so a single hoisted copy serves both.)

- [ ] **Step 2: Add AI env vars**

Append to `backend/.env` (and mirror into `backend/.env.template` with the same keys but empty values, if that file exists):

```bash
# AI module — platform-owned ("one brain, many memories")
# AI_PROVIDER: groq | mock | mock-fail  (mock = deterministic canned outputs, no API key needed)
AI_PROVIDER=mock
AI_MODEL=llama-3.3-70b-versatile
AI_FREE_TIER_MONTHLY_LIMIT=100
GROQ_API_KEY=
```

- [ ] **Step 3: Create `backend/src/modules/ai/models/ai-usage.ts`:**

```ts
import { model } from "@medusajs/framework/utils"

// One row per successful AI action — the source of truth for quota math
// and for future paid-tier billing.
const AiUsage = model
  .define("ai_usage", {
    id: model.id().primaryKey(),
    seller_id: model.text(),
    capability: model.text(),
    model_id: model.text(),
    prompt_tokens: model.number().nullable(),
    completion_tokens: model.number().nullable(),
  })
  .indexes([{ on: ["seller_id"] }])

export default AiUsage
```

- [ ] **Step 4: Create `backend/src/modules/ai/models/ai-quota.ts`:**

```ts
import { model } from "@medusajs/framework/utils"

// Optional per-seller override of the free-tier monthly limit.
// This is the hook for paid tiers later: a paid seller simply gets a
// higher monthly_limit row.
const AiQuota = model.define("ai_quota", {
  id: model.id().primaryKey(),
  seller_id: model.text().unique(),
  monthly_limit: model.number(),
})

export default AiQuota
```

- [ ] **Step 5: Create `backend/src/modules/ai/service.ts`:**

```ts
import { MedusaService } from "@medusajs/framework/utils"
import AiUsage from "./models/ai-usage"
import AiQuota from "./models/ai-quota"

export class AiQuotaExceededError extends Error {
  constructor(public readonly limit: number) {
    super(`AI monthly quota of ${limit} actions exhausted`)
    this.name = "AiQuotaExceededError"
  }
}

const DEFAULT_MONTHLY_LIMIT = 100

export type QuotaStatus = {
  used: number
  limit: number
  remaining: number
}

class AiModuleService extends MedusaService({ AiUsage, AiQuota }) {
  protected defaultMonthlyLimit(): number {
    const parsed = parseInt(process.env.AI_FREE_TIER_MONTHLY_LIMIT || "", 10)
    return Number.isFinite(parsed) && parsed > 0
      ? parsed
      : DEFAULT_MONTHLY_LIMIT
  }

  async getMonthlyLimit(sellerId: string): Promise<number> {
    const [override] = await this.listAiQuotas({ seller_id: sellerId })
    return override?.monthly_limit ?? this.defaultMonthlyLimit()
  }

  async getQuotaStatus(sellerId: string): Promise<QuotaStatus> {
    const monthStart = new Date()
    monthStart.setUTCDate(1)
    monthStart.setUTCHours(0, 0, 0, 0)

    const [, used] = await this.listAndCountAiUsages({
      seller_id: sellerId,
      created_at: { $gte: monthStart },
    })

    const limit = await this.getMonthlyLimit(sellerId)

    return { used, limit, remaining: Math.max(0, limit - used) }
  }

  async assertQuota(sellerId: string): Promise<QuotaStatus> {
    const status = await this.getQuotaStatus(sellerId)

    if (status.remaining <= 0) {
      throw new AiQuotaExceededError(status.limit)
    }

    return status
  }

  async recordUsage(data: {
    seller_id: string
    capability: string
    model_id: string
    prompt_tokens?: number | null
    completion_tokens?: number | null
  }) {
    return await this.createAiUsages(data)
  }
}

export default AiModuleService
```

- [ ] **Step 6: Create `backend/src/modules/ai/index.ts`:**

```ts
import { Module } from "@medusajs/framework/utils"
import AiModuleService from "./service"

export const AI_MODULE = "ai"

export default Module(AI_MODULE, {
  service: AiModuleService,
})
```

- [ ] **Step 7: Register the module in `backend/medusa-config.ts`** — add to the `modules` array, directly after the marketplace entry:

```ts
    {
      resolve: "./src/modules/ai",
    },
```

- [ ] **Step 8: Generate + run the migration — FROM THE JUNCTION:**

```powershell
cd C:\Users\mosho\howsu-link\backend
$env:NODE_OPTIONS="--preserve-symlinks --preserve-symlinks-main"
npx medusa db:generate ai
npx medusa db:migrate
```

Expected: a `Migration*.ts` appears under `backend/src/modules/ai/migrations/` creating tables `ai_usage` and `ai_quota`; migrate reports the ai migration as executed. (The known harmless inventory-module TypeError may follow — ignore it only if the migration lines succeeded.) Verify tables:

```powershell
docker exec howsu-postgres psql -U howsu -d howsu -c "\dt" | Select-String "ai_"
```

Expected: `ai_usage` and `ai_quota` listed.

- [ ] **Step 9: TypeScript check + clean boot**

Run from `"C:\Users\mosho\Desktop\How's you\backend"`: `npx tsc --noEmit` → zero errors. Restart the dev server (kill backend-owned node processes only; `npm run dev` in background, log OUTSIDE the project dir e.g. `$env:TEMP\howsu-backend-boot.log` — a log file inside `backend/` triggers a watcher restart loop); confirm clean boot and `http://localhost:9000/health` → 200.

- [ ] **Step 10: Commit**

```powershell
cd "C:\Users\mosho\Desktop\How's you"; git add backend/package.json backend/package-lock.json backend/src/modules/ai backend/medusa-config.ts; git commit -m "feat(backend): ai module with usage ledger and per-seller quota"
```

(`.env` is git-ignored; if `.env.template` was updated, add it too.)

---

### Task 2: AI lib — provider factory, capabilities, seller context, route guard

Pure library code under `backend/src/lib/ai/` — no routes yet. Modules are isolated in Medusa, so everything that touches other modules' data (products/orders/commissions) lives here and in routes, NOT inside the ai module.

**Files:**
- Create: `backend/src/lib/ai/model.ts`
- Create: `backend/src/lib/ai/capabilities.ts`
- Create: `backend/src/lib/ai/seller-context.ts`
- Create: `backend/src/lib/ai/run-ai-route.ts`

- [ ] **Step 1: Create `backend/src/lib/ai/model.ts`:**

```ts
import { createGroq } from "@ai-sdk/groq"
import { LanguageModel } from "ai"
import { MockLanguageModelV2 } from "ai/test"

export class AiUnavailableError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "AiUnavailableError"
  }
}

export const DEFAULT_AI_MODEL = "llama-3.3-70b-versatile"

export function getModelId(): string {
  const provider = process.env.AI_PROVIDER || "groq"
  if (provider !== "groq") {
    return provider
  }
  return process.env.AI_MODEL || DEFAULT_AI_MODEL
}

// Canned outputs for the deterministic mock provider. Structured
// capabilities get schema-conforming JSON; text capabilities get prose.
const CANNED_OUTPUTS: Record<string, string> = {
  listing: JSON.stringify({
    title: "Handwoven Ankara Tote Bag",
    description:
      "A mock product description generated by the deterministic test provider.",
    tags: ["ankara", "tote", "handmade"],
    seo_title: "Handwoven Ankara Tote Bag | How's u",
    seo_description: "Mock SEO description for the Ankara tote.",
  }),
  pricing: JSON.stringify({
    suggested_price: 12000,
    floor_price: 9000,
    ceiling_price: 15000,
    reasoning: "Mock reasoning based on marketplace price statistics.",
  }),
  marketing: JSON.stringify({
    brand_voice: "Warm, confident, and proudly local.",
    promo_ideas: ["Mock promo idea one", "Mock promo idea two"],
    bundle_suggestions: ["Mock bundle suggestion"],
  }),
  insights: "Mock insight: your best seller this month is the Demo Ankara Tote.",
  accounting:
    "Mock digest: revenue, commission deducted, and net earnings summarized.",
}

// Every capability's system prompt begins with "[capability:<name>]" so the
// mock can return the right canned shape.
function detectCapability(prompt: unknown): string {
  const serialized = JSON.stringify(prompt)
  const match = /\[capability:(\w+)\]/.exec(serialized)
  return match?.[1] ?? "insights"
}

function buildMockModel(fail: boolean): MockLanguageModelV2 {
  return new MockLanguageModelV2({
    doGenerate: async (options) => {
      // expose the exact prompt for isolation assertions in tests
      ;(globalThis as any).__howsuLastAiPrompt = JSON.stringify(options.prompt)

      if (fail) {
        throw new AiUnavailableError("mock provider forced failure")
      }

      const capability = detectCapability(options.prompt)

      return {
        finishReason: "stop" as const,
        usage: { inputTokens: 10, outputTokens: 20, totalTokens: 30 },
        content: [
          { type: "text" as const, text: CANNED_OUTPUTS[capability] },
        ],
        warnings: [],
      }
    },
  })
}

export function getModel(): LanguageModel {
  const provider = process.env.AI_PROVIDER || "groq"

  if (provider === "mock") {
    return buildMockModel(false)
  }
  if (provider === "mock-fail") {
    return buildMockModel(true)
  }

  const apiKey = process.env.GROQ_API_KEY
  if (!apiKey) {
    throw new AiUnavailableError(
      "GROQ_API_KEY is not configured — AI features are disabled"
    )
  }

  const groq = createGroq({ apiKey })
  return groq(process.env.AI_MODEL || DEFAULT_AI_MODEL)
}
```

- [ ] **Step 2: Create `backend/src/lib/ai/capabilities.ts`:**

```ts
import { generateObject, generateText } from "ai"
import { z } from "zod"
import { getModel } from "./model"

export type AiUsageTokens = {
  inputTokens?: number
  outputTokens?: number
}

export type CapabilityOutput<T> = {
  result: T
  usage: AiUsageTokens
}

// ---------- listing writer ----------

export const ListingResultSchema = z.object({
  title: z.string(),
  description: z.string(),
  tags: z.array(z.string()),
  seo_title: z.string(),
  seo_description: z.string(),
})

export type ListingResult = z.infer<typeof ListingResultSchema>

export async function generateListing(input: {
  notes: string
  category?: string
}): Promise<CapabilityOutput<ListingResult>> {
  const { object, usage } = await generateObject({
    model: getModel(),
    schema: ListingResultSchema,
    system:
      "[capability:listing] You write compelling, honest e-commerce product " +
      "listings for an African marketplace. Plain language, no hype words, " +
      "no invented specifications.",
    prompt:
      `Write a product listing from these rough seller notes:\n` +
      `Notes: ${input.notes}\n` +
      (input.category ? `Category: ${input.category}\n` : ""),
  })

  return {
    result: object,
    usage: { inputTokens: usage.inputTokens, outputTokens: usage.outputTokens },
  }
}

// ---------- pricing advisor ----------

export const PricingResultSchema = z.object({
  suggested_price: z.number(),
  floor_price: z.number(),
  ceiling_price: z.number(),
  reasoning: z.string(),
})

export type PricingResult = z.infer<typeof PricingResultSchema>

export type MarketPriceStats = {
  currency_code: string
  sample_size: number
  min: number | null
  median: number | null
  max: number | null
}

export async function suggestPricing(input: {
  title: string
  category?: string
  cost?: number
  currency_code: string
  market: MarketPriceStats
}): Promise<CapabilityOutput<PricingResult>> {
  const { object, usage } = await generateObject({
    model: getModel(),
    schema: PricingResultSchema,
    system:
      "[capability:pricing] You are a pricing advisor for marketplace " +
      "sellers. Recommend realistic prices in the given currency's minor " +
      "units, grounded in the aggregated marketplace statistics provided. " +
      "Never reference individual competitors.",
    prompt:
      `Product: ${input.title}\n` +
      (input.category ? `Category: ${input.category}\n` : "") +
      (input.cost != null ? `Seller's unit cost: ${input.cost}\n` : "") +
      `Currency: ${input.currency_code}\n` +
      `Aggregated marketplace price stats (same currency): ` +
      `${JSON.stringify(input.market)}\n` +
      `Suggest a price, a floor, and a ceiling.`,
  })

  return {
    result: object,
    usage: { inputTokens: usage.inputTokens, outputTokens: usage.outputTokens },
  }
}

// ---------- business insights ----------

export async function answerInsightsQuestion(input: {
  question: string
  contextJson: string
}): Promise<CapabilityOutput<string>> {
  const { text, usage } = await generateText({
    model: getModel(),
    system:
      "[capability:insights] You answer business questions for ONE " +
      "marketplace seller using ONLY the seller data provided in the " +
      "prompt. If the data cannot answer the question, say so plainly. " +
      "Never invent numbers.",
    prompt:
      `Seller data (JSON):\n${input.contextJson}\n\n` +
      `Question: ${input.question}`,
  })

  return {
    result: text,
    usage: { inputTokens: usage.inputTokens, outputTokens: usage.outputTokens },
  }
}

// ---------- accounting summary ----------

export async function writeAccountingDigest(input: {
  aggregatesJson: string
}): Promise<CapabilityOutput<string>> {
  const { text, usage } = await generateText({
    model: getModel(),
    system:
      "[capability:accounting] You explain a marketplace seller's earnings " +
      "in plain language: gross revenue, platform commission deducted, and " +
      "net earnings, per currency and per month. Use ONLY the numbers " +
      "provided — never invent or extrapolate figures.",
    prompt: `Earnings aggregates (JSON):\n${input.aggregatesJson}`,
  })

  return {
    result: text,
    usage: { inputTokens: usage.inputTokens, outputTokens: usage.outputTokens },
  }
}

// ---------- marketing coach ----------

export const MarketingResultSchema = z.object({
  brand_voice: z.string(),
  promo_ideas: z.array(z.string()),
  bundle_suggestions: z.array(z.string()),
})

export type MarketingResult = z.infer<typeof MarketingResultSchema>

export async function coachMarketing(input: {
  goal?: string
  tone?: string
  productsJson: string
}): Promise<CapabilityOutput<MarketingResult>> {
  const { object, usage } = await generateObject({
    model: getModel(),
    schema: MarketingResultSchema,
    system:
      "[capability:marketing] You are a marketing coach for small " +
      "marketplace sellers. Ground every suggestion in the seller's actual " +
      "catalog provided in the prompt. Practical, low-budget ideas only.",
    prompt:
      (input.goal ? `Seller goal: ${input.goal}\n` : "") +
      (input.tone ? `Preferred tone: ${input.tone}\n` : "") +
      `Seller catalog (JSON):\n${input.productsJson}`,
  })

  return {
    result: object,
    usage: { inputTokens: usage.inputTokens, outputTokens: usage.outputTokens },
  }
}
```

- [ ] **Step 3: Create `backend/src/lib/ai/seller-context.ts`:**

```ts
import { MedusaError } from "@medusajs/framework/utils"

// Hard per-seller isolation: every builder takes the seller identity that
// was resolved from the authenticated actor and filters strictly by it.

export type SellerIdentity = {
  seller_admin_id: string
  seller_id: string
  seller_name: string
}

type Query = {
  graph: (config: any) => Promise<{ data: any[] }>
}

export async function resolveSeller(
  query: Query,
  actorId: string
): Promise<SellerIdentity> {
  const {
    data: [sellerAdmin],
  } = await query.graph({
    entity: "seller_admin",
    fields: ["id", "seller.id", "seller.name"],
    filters: { id: [actorId] },
  })

  if (!sellerAdmin?.seller) {
    throw new MedusaError(
      MedusaError.Types.UNAUTHORIZED,
      "Seller not found for authenticated actor"
    )
  }

  return {
    seller_admin_id: sellerAdmin.id,
    seller_id: sellerAdmin.seller.id,
    seller_name: sellerAdmin.seller.name,
  }
}

export async function getSellerProducts(
  query: Query,
  sellerId: string,
  limit = 50
): Promise<any[]> {
  const {
    data: [seller],
  } = await query.graph({
    entity: "seller",
    fields: [
      "products.id",
      "products.title",
      "products.status",
      "products.variants.title",
      "products.variants.prices.amount",
      "products.variants.prices.currency_code",
    ],
    filters: { id: sellerId },
  })

  return (seller?.products ?? []).filter(Boolean).slice(0, limit)
}

export async function getSellerOrders(
  query: Query,
  sellerId: string,
  limit = 30
): Promise<any[]> {
  const {
    data: [seller],
  } = await query.graph({
    entity: "seller",
    fields: ["orders.id"],
    filters: { id: sellerId },
  })

  const orderIds = (seller?.orders ?? [])
    .filter(Boolean)
    .map((o: any) => o.id)
    .slice(0, limit)

  if (!orderIds.length) {
    return []
  }

  const { data: orders } = await query.graph({
    entity: "order",
    fields: [
      "id",
      "display_id",
      "status",
      "created_at",
      "currency_code",
      "total",
      "items.title",
      "items.quantity",
    ],
    filters: { id: orderIds },
  })

  return orders
}

export async function getSellerCommissionLines(
  query: Query,
  sellerId: string
): Promise<any[]> {
  const {
    data: [seller],
  } = await query.graph({
    entity: "seller",
    fields: ["commission_lines.*"],
    filters: { id: sellerId },
  })

  return (seller?.commission_lines ?? []).filter(Boolean)
}
```

- [ ] **Step 4: Create `backend/src/lib/ai/run-ai-route.ts`:**

```ts
import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { AI_MODULE } from "../../modules/ai"
import AiModuleService, {
  AiQuotaExceededError,
} from "../../modules/ai/service"
import { getModelId } from "./model"
import { AiUsageTokens } from "./capabilities"
import { resolveSeller, SellerIdentity } from "./seller-context"

type HandlerContext = {
  query: any
  seller: SellerIdentity
}

type HandlerOutput<T> = {
  result: T
  usage: AiUsageTokens
  // deterministic numbers computed in code, returned alongside the AI text
  extra?: Record<string, unknown>
}

// Shared guard for every AI route:
// - resolves the seller from the authenticated actor (hard isolation)
// - enforces quota BEFORE calling the provider (friendly 429)
// - maps any provider failure to a friendly 503 — AI never blocks commerce
// - records usage only on success
export async function runAiRoute<T>(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse,
  capability: string,
  handler: (ctx: HandlerContext) => Promise<HandlerOutput<T>>
): Promise<void> {
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const logger = req.scope.resolve(ContainerRegistrationKeys.LOGGER)
  const aiService: AiModuleService = req.scope.resolve(AI_MODULE)

  const seller = await resolveSeller(query, req.auth_context.actor_id)

  try {
    await aiService.assertQuota(seller.seller_id)
  } catch (e) {
    if (e instanceof AiQuotaExceededError) {
      res.status(429).json({
        ok: false,
        code: "quota_exhausted",
        message:
          `You've used all ${e.limit} free AI actions for this month. ` +
          `Your store keeps running as usual — AI tools unlock again next month.`,
      })
      return
    }
    throw e
  }

  try {
    const { result, usage, extra } = await handler({ query, seller })

    await aiService.recordUsage({
      seller_id: seller.seller_id,
      capability,
      model_id: getModelId(),
      prompt_tokens: usage.inputTokens ?? null,
      completion_tokens: usage.outputTokens ?? null,
    })

    const quota = await aiService.getQuotaStatus(seller.seller_id)

    res.json({ ok: true, capability, result, ...(extra ?? {}), quota })
  } catch (e) {
    logger.error(`AI capability "${capability}" failed: ${e}`)
    res.status(503).json({
      ok: false,
      code: "ai_unavailable",
      message:
        "The AI assistant is temporarily unavailable. Your store keeps " +
        "running — please try again shortly.",
    })
  }
}
```

- [ ] **Step 5: TypeScript check**

Run from `"C:\Users\mosho\Desktop\How's you\backend"`: `npx tsc --noEmit` → zero errors.

- [ ] **Step 6: Commit**

```powershell
cd "C:\Users\mosho\Desktop\How's you"; git add backend/src/lib; git commit -m "feat(backend): ai provider factory, capabilities, seller context, route guard"
```

---

### Task 3: AI routes — the 5 capabilities + quota status

**Files:**
- Create: `backend/src/api/sellers/ai/listing/route.ts`
- Create: `backend/src/api/sellers/ai/pricing/route.ts`
- Create: `backend/src/api/sellers/ai/insights/route.ts`
- Create: `backend/src/api/sellers/ai/accounting/route.ts`
- Create: `backend/src/api/sellers/ai/marketing/route.ts`
- Create: `backend/src/api/sellers/ai/quota/route.ts`
- Modify: `backend/src/api/middlewares.ts` (add body validators for the 5 POST routes)

All routes live under `/sellers/*` and are therefore already protected by the existing `authenticate("seller", ["session", "bearer"])` middleware — no auth changes.

- [ ] **Step 1: Add validators to `backend/src/api/middlewares.ts`**

Read the file first. Add these schemas next to the existing `PostSellerCreateSchema` (same file, same style), and register one `validateAndTransformBody` middleware per route in the `routes` array (keep every existing entry untouched):

```ts
export const PostAiListingSchema = z.object({
  notes: z.string().min(3),
  category: z.string().optional(),
})

export const PostAiPricingSchema = z.object({
  title: z.string().min(2),
  category: z.string().optional(),
  cost: z.number().positive().optional(),
  currency_code: z.string().default("ngn"),
})

export const PostAiInsightsSchema = z.object({
  question: z.string().min(3),
})

export const PostAiAccountingSchema = z.object({})

export const PostAiMarketingSchema = z.object({
  goal: z.string().optional(),
  tone: z.string().optional(),
})
```

New route entries (add after the existing `/sellers/products` entry):

```ts
    {
      matcher: "/sellers/ai/listing",
      methods: ["POST"],
      middlewares: [validateAndTransformBody(PostAiListingSchema)],
    },
    {
      matcher: "/sellers/ai/pricing",
      methods: ["POST"],
      middlewares: [validateAndTransformBody(PostAiPricingSchema)],
    },
    {
      matcher: "/sellers/ai/insights",
      methods: ["POST"],
      middlewares: [validateAndTransformBody(PostAiInsightsSchema)],
    },
    {
      matcher: "/sellers/ai/accounting",
      methods: ["POST"],
      middlewares: [validateAndTransformBody(PostAiAccountingSchema)],
    },
    {
      matcher: "/sellers/ai/marketing",
      methods: ["POST"],
      middlewares: [validateAndTransformBody(PostAiMarketingSchema)],
    },
```

- [ ] **Step 2: Create `backend/src/api/sellers/ai/listing/route.ts`:**

```ts
import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { z } from "zod"
import { runAiRoute } from "../../../../lib/ai/run-ai-route"
import { generateListing } from "../../../../lib/ai/capabilities"
import { PostAiListingSchema } from "../../../middlewares"

type Body = z.infer<typeof PostAiListingSchema>

export const POST = async (
  req: AuthenticatedMedusaRequest<Body>,
  res: MedusaResponse
) => {
  await runAiRoute(req, res, "listing", async () => {
    return await generateListing({
      notes: req.validatedBody.notes,
      category: req.validatedBody.category,
    })
  })
}
```

- [ ] **Step 3: Create `backend/src/api/sellers/ai/pricing/route.ts`:**

```ts
import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { z } from "zod"
import { runAiRoute } from "../../../../lib/ai/run-ai-route"
import {
  suggestPricing,
  MarketPriceStats,
} from "../../../../lib/ai/capabilities"
import { PostAiPricingSchema } from "../../../middlewares"

type Body = z.infer<typeof PostAiPricingSchema>

// Aggregated, anonymized marketplace stats — the advisor never sees
// individual competitors, only min/median/max in the same currency.
async function getMarketPriceStats(
  query: any,
  currencyCode: string
): Promise<MarketPriceStats> {
  const { data: prices } = await query.graph({
    entity: "price",
    fields: ["amount", "currency_code"],
    filters: { currency_code: currencyCode },
  })

  const amounts = (prices ?? [])
    .map((p: any) => Number(p.amount))
    .filter((n: number) => Number.isFinite(n) && n > 0)
    .sort((a: number, b: number) => a - b)

  if (!amounts.length) {
    return {
      currency_code: currencyCode,
      sample_size: 0,
      min: null,
      median: null,
      max: null,
    }
  }

  return {
    currency_code: currencyCode,
    sample_size: amounts.length,
    min: amounts[0],
    median: amounts[Math.floor(amounts.length / 2)],
    max: amounts[amounts.length - 1],
  }
}

export const POST = async (
  req: AuthenticatedMedusaRequest<Body>,
  res: MedusaResponse
) => {
  await runAiRoute(req, res, "pricing", async ({ query }) => {
    const currency = req.validatedBody.currency_code
    const market = await getMarketPriceStats(query, currency)

    const output = await suggestPricing({
      title: req.validatedBody.title,
      category: req.validatedBody.category,
      cost: req.validatedBody.cost,
      currency_code: currency,
      market,
    })

    return { ...output, extra: { market } }
  })
}
```

- [ ] **Step 4: Create `backend/src/api/sellers/ai/insights/route.ts`:**

```ts
import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { z } from "zod"
import { runAiRoute } from "../../../../lib/ai/run-ai-route"
import { answerInsightsQuestion } from "../../../../lib/ai/capabilities"
import {
  getSellerOrders,
  getSellerProducts,
} from "../../../../lib/ai/seller-context"
import { PostAiInsightsSchema } from "../../../middlewares"

type Body = z.infer<typeof PostAiInsightsSchema>

export const POST = async (
  req: AuthenticatedMedusaRequest<Body>,
  res: MedusaResponse
) => {
  await runAiRoute(req, res, "insights", async ({ query, seller }) => {
    // context is built ONLY from this seller's own data
    const [products, orders] = await Promise.all([
      getSellerProducts(query, seller.seller_id),
      getSellerOrders(query, seller.seller_id),
    ])

    const contextJson = JSON.stringify({
      seller_name: seller.seller_name,
      products,
      orders,
    })

    return await answerInsightsQuestion({
      question: req.validatedBody.question,
      contextJson,
    })
  })
}
```

- [ ] **Step 5: Create `backend/src/api/sellers/ai/accounting/route.ts`:**

```ts
import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { runAiRoute } from "../../../../lib/ai/run-ai-route"
import { writeAccountingDigest } from "../../../../lib/ai/capabilities"
import { getSellerCommissionLines } from "../../../../lib/ai/seller-context"

// Deterministic money math happens HERE in code; the model only turns the
// finished numbers into a plain-language digest.
function aggregate(lines: any[]) {
  const byCurrency: Record<
    string,
    { gross: number; commission: number; net: number; orders: number }
  > = {}
  const byMonth: Record<string, { gross: number; net: number }> = {}

  for (const line of lines) {
    const currency = line.currency_code
    byCurrency[currency] ??= { gross: 0, commission: 0, net: 0, orders: 0 }
    byCurrency[currency].gross += Number(line.order_total)
    byCurrency[currency].commission += Number(line.commission_amount)
    byCurrency[currency].net += Number(line.net_amount)
    byCurrency[currency].orders += 1

    const month = String(line.created_at).slice(0, 7)
    byMonth[month] ??= { gross: 0, net: 0 }
    byMonth[month].gross += Number(line.order_total)
    byMonth[month].net += Number(line.net_amount)
  }

  return { by_currency: byCurrency, by_month: byMonth }
}

export const POST = async (
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) => {
  await runAiRoute(req, res, "accounting", async ({ query, seller }) => {
    const lines = await getSellerCommissionLines(query, seller.seller_id)
    const aggregates = aggregate(lines)

    const output = await writeAccountingDigest({
      aggregatesJson: JSON.stringify(aggregates),
    })

    return { ...output, extra: { aggregates } }
  })
}
```

- [ ] **Step 6: Create `backend/src/api/sellers/ai/marketing/route.ts`:**

```ts
import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { z } from "zod"
import { runAiRoute } from "../../../../lib/ai/run-ai-route"
import { coachMarketing } from "../../../../lib/ai/capabilities"
import { getSellerProducts } from "../../../../lib/ai/seller-context"
import { PostAiMarketingSchema } from "../../../middlewares"

type Body = z.infer<typeof PostAiMarketingSchema>

export const POST = async (
  req: AuthenticatedMedusaRequest<Body>,
  res: MedusaResponse
) => {
  await runAiRoute(req, res, "marketing", async ({ query, seller }) => {
    const products = await getSellerProducts(query, seller.seller_id)

    return await coachMarketing({
      goal: req.validatedBody.goal,
      tone: req.validatedBody.tone,
      productsJson: JSON.stringify(products),
    })
  })
}
```

- [ ] **Step 7: Create `backend/src/api/sellers/ai/quota/route.ts`:**

```ts
import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { AI_MODULE } from "../../../../modules/ai"
import AiModuleService from "../../../../modules/ai/service"
import { resolveSeller } from "../../../../lib/ai/seller-context"

export const GET = async (
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) => {
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const aiService: AiModuleService = req.scope.resolve(AI_MODULE)

  const seller = await resolveSeller(query, req.auth_context.actor_id)
  const quota = await aiService.getQuotaStatus(seller.seller_id)

  res.json({ quota })
}
```

- [ ] **Step 8: TypeScript check + live verification (mock provider)**

`npx tsc --noEmit` from `"C:\Users\mosho\Desktop\How's you\backend"` → zero errors. Restart dev server (backend-owned processes only, log outside project dir), health 200. Then:

```powershell
$login = Invoke-RestMethod -Method Post -Uri http://localhost:9000/auth/seller/emailpass -ContentType "application/json" -Body '{"email":"demo-seller@howsu.local","password":"supersecret"}'
$h = @{Authorization="Bearer $($login.token)"}
Invoke-RestMethod -Uri http://localhost:9000/sellers/ai/quota -Headers $h
Invoke-RestMethod -Method Post -Uri http://localhost:9000/sellers/ai/listing -Headers $h -ContentType "application/json" -Body '{"notes":"handmade ankara tote bag, strong straps"}'
Invoke-RestMethod -Method Post -Uri http://localhost:9000/sellers/ai/insights -Headers $h -ContentType "application/json" -Body '{"question":"what sold best this month?"}'
Invoke-RestMethod -Uri http://localhost:9000/sellers/ai/quota -Headers $h
```

Expected: first quota `{used: 0, limit: 100, remaining: 100}`; listing returns `ok: true` with the canned structured object and `quota.used: 1`; insights returns `ok: true` with the canned text; final quota shows `used: 2, remaining: 98`. Also verify unauthenticated `POST /sellers/ai/listing` → 401, and a validation failure (e.g. `{"notes":"x"}`) → 400.

- [ ] **Step 9: Commit**

```powershell
cd "C:\Users\mosho\Desktop\How's you"; git add backend/src/api; git commit -m "feat(backend): five seller AI capability routes with quota guard"
```

---

### Task 4: Provider-failure fallback + quota-exhaustion live proof

No new files — behavioral verification of the two degradation paths, using env toggles. Included so the evidence is captured.

**Files:** none (env-only toggles; `.env` is git-ignored)

- [ ] **Step 1: Provider-down proof (`mock-fail`)**

Edit `backend/.env`: set `AI_PROVIDER=mock-fail`. Restart the dev server. Then:

```powershell
$login = Invoke-RestMethod -Method Post -Uri http://localhost:9000/auth/seller/emailpass -ContentType "application/json" -Body '{"email":"demo-seller@howsu.local","password":"supersecret"}'
$h = @{Authorization="Bearer $($login.token)"}
try { Invoke-RestMethod -Method Post -Uri http://localhost:9000/sellers/ai/listing -Headers $h -ContentType "application/json" -Body '{"notes":"test bag for failure path"}' } catch { $_.Exception.Response.StatusCode.value__; $_.ErrorDetails.Message }
Invoke-RestMethod -Uri http://localhost:9000/sellers/ai/quota -Headers $h
```

Expected: 503 with `code: "ai_unavailable"` and the friendly message; quota `used` is UNCHANGED from before the call (failures are never billed). Commerce proof: `GET /sellers/products` with the same token still returns 200 with products.

- [ ] **Step 2: Quota-exhaustion proof**

Set `AI_PROVIDER=mock` again, and set `AI_FREE_TIER_MONTHLY_LIMIT=3`. Restart. Call `POST /sellers/ai/listing` (same body) repeatedly until it stops succeeding — given usage already recorded this month, the first call past the limit must return 429 with `code: "quota_exhausted"` and the friendly "unlock next month" message (NOT a raw error). `GET /sellers/ai/quota` shows `remaining: 0`. Commerce proof again: `GET /sellers/products` still 200.

- [ ] **Step 3: Restore env + reboot**

Set `AI_FREE_TIER_MONTHLY_LIMIT=100`, keep `AI_PROVIDER=mock`. Restart dev server, health 200.

- [ ] **Step 4: No commit** (env files are git-ignored; nothing tracked changed). Report evidence only.

---

### Task 5: Integration tests — quota, isolation, fallback

**Files:**
- Create: `backend/integration-tests/http/ai.spec.ts`

- [ ] **Step 1: Read the existing pattern**

Read `backend/integration-tests/http/marketplace.spec.ts` — reuse its runner shape (`medusaIntegrationTestRunner`, `inApp: true`, `dbUtils.snapshot()` trick after onboarding).

- [ ] **Step 2: Create `backend/integration-tests/http/ai.spec.ts`:**

```ts
import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
import { AI_MODULE } from "../../src/modules/ai"
import AiModuleService from "../../src/modules/ai/service"

jest.setTimeout(120 * 1000)

// The suite runs with the deterministic mock provider — no API key, no
// network. mock-fail is toggled per-test via process.env (getModel() reads
// the env on every call).
process.env.AI_PROVIDER = "mock"
process.env.AI_FREE_TIER_MONTHLY_LIMIT = "5"

const onboardSeller = async (api: any, email: string, handle: string) => {
  const register = await api.post("/auth/seller/emailpass/register", {
    email,
    password: "supersecret",
  })

  await api.post(
    "/sellers",
    {
      name: handle,
      handle,
      admin: { email, first_name: "Ai", last_name: "Test" },
    },
    { headers: { Authorization: `Bearer ${register.data.token}` } }
  )

  const login = await api.post("/auth/seller/emailpass", {
    email,
    password: "supersecret",
  })

  return login.data.token as string
}

medusaIntegrationTestRunner({
  inApp: true,
  env: {},
  testSuite: ({ api, getContainer, dbUtils }) => {
    describe("AI module", () => {
      let aiService: AiModuleService
      let tokenA: string
      let tokenB: string

      beforeAll(() => {
        aiService = getContainer().resolve(AI_MODULE)
      })

      it("onboards two sellers with one owned product each", async () => {
        tokenA = await onboardSeller(api, "ai-a@howsu.local", "ai-seller-a")
        tokenB = await onboardSeller(api, "ai-b@howsu.local", "ai-seller-b")

        for (const [token, title] of [
          [tokenA, "Seller A Secret Scarf"],
          [tokenB, "Seller B Private Lamp"],
        ] as const) {
          const created = await api.post(
            "/sellers/products",
            {
              title,
              status: "published",
              options: [{ title: "Size", values: ["One"] }],
              variants: [
                {
                  title: "One Size",
                  prices: [{ currency_code: "ngn", amount: 5000 }],
                  manage_inventory: false,
                  options: { Size: "One" },
                },
              ],
            },
            { headers: { Authorization: `Bearer ${token}` } }
          )
          expect(created.status).toEqual(200)
        }

        // persist across the runner's per-test DB restore
        await dbUtils.snapshot()
      })

      describe("quota enforcement", () => {
        it("counts usage and blocks with a friendly 429 at the limit", async () => {
          const before = await api.get("/sellers/ai/quota", {
            headers: { Authorization: `Bearer ${tokenA}` },
          })
          expect(before.data.quota.limit).toEqual(5)

          const remaining = before.data.quota.remaining
          for (let i = 0; i < remaining; i++) {
            const ok = await api.post(
              "/sellers/ai/listing",
              { notes: "quota filler product notes" },
              { headers: { Authorization: `Bearer ${tokenA}` } }
            )
            expect(ok.status).toEqual(200)
            expect(ok.data.ok).toBe(true)
          }

          await expect(
            api.post(
              "/sellers/ai/listing",
              { notes: "one past the limit" },
              { headers: { Authorization: `Bearer ${tokenA}` } }
            )
          ).rejects.toMatchObject({
            response: {
              status: 429,
              data: { code: "quota_exhausted" },
            },
          })

          const after = await api.get("/sellers/ai/quota", {
            headers: { Authorization: `Bearer ${tokenA}` },
          })
          expect(after.data.quota.remaining).toEqual(0)
        })

        it("supports per-seller quota overrides", async () => {
          const [usage] = await aiService.listAiUsages({}, { take: 1 })
          const sellerId = usage.seller_id

          await aiService.createAiQuotas({
            seller_id: sellerId,
            monthly_limit: 50,
          })

          const status = await aiService.getQuotaStatus(sellerId)
          expect(status.limit).toEqual(50)
          expect(status.remaining).toBeGreaterThan(0)
        })
      })

      describe("per-seller isolation", () => {
        it("builds insights context ONLY from the caller's own data", async () => {
          const res = await api.post(
            "/sellers/ai/insights",
            { question: "what sold best this month?" },
            { headers: { Authorization: `Bearer ${tokenB}` } }
          )

          expect(res.status).toEqual(200)

          // the mock model captures the exact prompt it received
          const prompt = (globalThis as any).__howsuLastAiPrompt as string
          expect(prompt).toContain("Seller B Private Lamp")
          expect(prompt).not.toContain("Seller A Secret Scarf")
        })

        it("rejects unauthenticated AI calls", async () => {
          await expect(
            api.post("/sellers/ai/listing", { notes: "no auth" })
          ).rejects.toMatchObject({ response: { status: 401 } })
        })
      })

      describe("provider failure fallback", () => {
        it("returns a friendly 503 and does not bill the seller", async () => {
          process.env.AI_PROVIDER = "mock-fail"

          try {
            const before = await api.get("/sellers/ai/quota", {
              headers: { Authorization: `Bearer ${tokenB}` },
            })

            await expect(
              api.post(
                "/sellers/ai/listing",
                { notes: "provider is down for this one" },
                { headers: { Authorization: `Bearer ${tokenB}` } }
              )
            ).rejects.toMatchObject({
              response: {
                status: 503,
                data: { code: "ai_unavailable" },
              },
            })

            const after = await api.get("/sellers/ai/quota", {
              headers: { Authorization: `Bearer ${tokenB}` },
            })
            expect(after.data.quota.used).toEqual(before.data.quota.used)

            // commerce keeps working while AI is down
            const products = await api.get("/sellers/products", {
              headers: { Authorization: `Bearer ${tokenB}` },
            })
            expect(products.status).toEqual(200)
          } finally {
            process.env.AI_PROVIDER = "mock"
          }
        })
      })
    })
  },
})
```

Note: if the runner's per-test DB restore breaks cross-test state despite the snapshot (as discovered in Phase 2), keep the assertions and restructure only the test boundaries the way `marketplace.spec.ts` does.

- [ ] **Step 3: Run the suite — subst-drive procedure (proven in Phase 2):**

```powershell
subst X: "C:\Users\mosho\Desktop\How's you"   # ignore error if already mapped
cd X:\backend
$env:HOWSU_REAL_PATH="C:\Users\mosho\Desktop\How's you"; $env:HOWSU_ALIAS_PATH="X:"
$env:NODE_OPTIONS="--experimental-vm-modules --require X:/backend/integration-tests/realpath-alias.js"
$env:TEST_TYPE="integration:http"; $env:DB_USERNAME="howsu"; $env:DB_PASSWORD="howsu_dev_password"
npx jest --silent=false --runInBand --forceExit
```

Expected: 3 suites (health, marketplace, ai) all passing; the ai suite adds 6 tests. Run can take several minutes; run in background with a log OUTSIDE the project dir and poll.

- [ ] **Step 4: Commit**

```powershell
cd "C:\Users\mosho\Desktop\How's you"; git add backend/integration-tests; git commit -m "test(backend): ai quota, isolation, and provider-fallback integration tests"
```

---

### Task 6: Docs — README AI section

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Append to `README.md`** after the Marketplace API section:

```markdown
## AI Module (Phase 3) — "one brain, many memories"

Platform-owned AI for sellers (no seller API keys, ever). Provider is a
config switch: `AI_PROVIDER=groq|mock|mock-fail`, `AI_MODEL`, `GROQ_API_KEY`
in `backend/.env` (Vercel AI SDK abstraction — swapping providers is an env
change, not a code change).

Seller endpoints (Bearer seller JWT):

| Endpoint | Capability |
|---|---|
| `POST /sellers/ai/listing` | Listing writer — title/description/tags/SEO from rough notes |
| `POST /sellers/ai/pricing` | Pricing advisor — grounded in anonymized marketplace price stats |
| `POST /sellers/ai/insights` | Business insights — answers from the seller's own products/orders only |
| `POST /sellers/ai/accounting` | Accounting digest — commission ledger math done in code, explained by AI |
| `POST /sellers/ai/marketing` | Marketing coach — brand voice, promos, bundles from the seller's catalog |
| `GET /sellers/ai/quota` | Current month usage/limit/remaining |

Rules: every call is quota-checked first (free tier
`AI_FREE_TIER_MONTHLY_LIMIT`/month, per-seller overrides via `ai_quota`);
quota exhaustion → friendly 429; provider failure → friendly 503 and the
action is never billed. AI failures never block commerce. Every AI call's
context is hard-scoped to the authenticated seller's own data.
```

- [ ] **Step 2: Commit**

```powershell
cd "C:\Users\mosho\Desktop\How's you"; git add README.md; git commit -m "docs: AI module endpoints, provider switching, and quota rules"
```

---

## Self-Review Notes

- Spec coverage: provider abstraction via env ✅ (Task 1 env + Task 2 model.ts), per-seller agent isolation ✅ (seller-context builders + isolation test asserting the prompt itself), 5 launch capabilities ✅ (Task 2 + Task 3), quota system with paid-tier hook ✅ (ai_usage + ai_quota override + tests), AI-never-blocks-commerce ✅ (run-ai-route 429/503 + Task 4 live proof + Task 5 test), Groq→other-provider switch is env-only ✅.
- Deterministic money math stays in code (accounting aggregates, pricing market stats); the model only narrates — no invented numbers by construction.
- Module isolation respected: the ai module stores only usage/quota rows; all cross-module reads happen in lib/routes via query.graph.
- Mock provider (`ai/test`'s MockLanguageModelV2) keeps dev + CI free of API keys; `mock-fail` exercises the degradation path; `__howsuLastAiPrompt` makes isolation provable rather than assumed.
- Type consistency check: `AiUsageTokens` shape (`inputTokens/outputTokens`) matches AI SDK v5 usage fields; `runAiRoute` handler return `{result, usage, extra?}` matches every capability's `CapabilityOutput` plus route-level spreads; schema names in middlewares.ts match the imports in each route file.

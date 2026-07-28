# Phase 2 — Marketplace Module Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the stock Medusa backend into a multi-seller marketplace: sellers with authenticated admins, product ownership, Jumia-style order splitting (1 parent + N child seller orders), and a commission ledger.

**Architecture:** A custom `marketplace` Medusa module (Seller, SellerAdmin, CommissionLine data models) + module links to Product and Order + workflows following Medusa's official marketplace recipe (adapted: "vendor" → "seller"). Custom actor type `seller` for authentication. Commission lines are written atomically inside the order-splitting workflow.

**Tech Stack:** Medusa v2.18.0 (TypeScript), PostgreSQL 16, Redis 7, Zod (`@medusajs/framework/zod`), Jest integration tests via `@medusajs/test-utils`.

---

## ⚠️ Environment rules (read before every task)

1. **Workspace path contains an apostrophe** (`C:\Users\mosho\Desktop\How's you`) which silently breaks fast-glob → Medusa migrations and the integration test runner. **ALL `medusa db:*` commands and ALL integration test runs MUST be executed from the junction path** `C:\Users\mosho\howsu-link\backend` with `$env:NODE_OPTIONS="--preserve-symlinks --preserve-symlinks-main"`. File edits can happen via either path (same files).
2. Shell is Windows PowerShell: use `;` as separator, never `&&`. Always quote paths containing the apostrophe.
3. The backend dev server may be running on :9000 (background). After config/module changes, restart it from `"C:\Users\mosho\Desktop\How's you\backend"` with `npm run dev` (dev server itself is not affected by the glob bug — only db:* commands are).
4. Postgres/Redis run in Docker (`howsu-postgres`, `howsu-redis`). Admin user: `admin@howsu.local` / `howsu_admin_dev`.
5. Commit from the workspace root `"C:\Users\mosho\Desktop\How's you"`; repo already initialized on `master`.

---

### Task 1: Wire Redis into Medusa config

**Files:**
- Modify: `backend/medusa-config.ts`

- [ ] **Step 1: Replace the full contents of `backend/medusa-config.ts` with:**

```ts
import { loadEnv, defineConfig } from '@medusajs/framework/utils'

loadEnv(process.env.NODE_ENV || 'development', process.cwd())

module.exports = defineConfig({
  projectConfig: {
    databaseUrl: process.env.DATABASE_URL,
    redisUrl: process.env.REDIS_URL,
    http: {
      storeCors: process.env.STORE_CORS!,
      adminCors: process.env.ADMIN_CORS!,
      authCors: process.env.AUTH_CORS!,
      jwtSecret: process.env.JWT_SECRET || "supersecret",
      cookieSecret: process.env.COOKIE_SECRET || "supersecret",
    }
  },
  modules: [
    {
      resolve: "@medusajs/medusa/event-bus-redis",
      options: {
        redisUrl: process.env.REDIS_URL,
      },
    },
    {
      resolve: "@medusajs/medusa/workflow-engine-redis",
      options: {
        redis: {
          url: process.env.REDIS_URL,
        },
      },
    },
  ],
})
```

- [ ] **Step 2: Restart the backend dev server and verify Redis is used**

From `"C:\Users\mosho\Desktop\How's you\backend"`: stop any running dev server, then `npm run dev` (background). Wait for boot, then:

Run: `Invoke-RestMethod http://localhost:9000/health`
Expected: `OK` (HTTP 200). Boot log must NOT contain the fake/in-memory redis warnings ("Using fake Redis instance" / "in-memory"); it should show the Redis event bus and workflow engine connecting.

- [ ] **Step 3: Commit**

```powershell
cd "C:\Users\mosho\Desktop\How's you"; git add backend/medusa-config.ts; git commit -m "feat(backend): wire Redis event bus and workflow engine"
```

---

### Task 2: Marketplace module — data models, service, registration, migration

**Files:**
- Create: `backend/src/modules/marketplace/models/seller.ts`
- Create: `backend/src/modules/marketplace/models/seller-admin.ts`
- Create: `backend/src/modules/marketplace/models/commission-line.ts`
- Create: `backend/src/modules/marketplace/service.ts`
- Create: `backend/src/modules/marketplace/index.ts`
- Modify: `backend/medusa-config.ts` (add module to `modules` array)

- [ ] **Step 1: Create `backend/src/modules/marketplace/models/seller.ts`:**

```ts
import { model } from "@medusajs/framework/utils"
import SellerAdmin from "./seller-admin"
import CommissionLine from "./commission-line"

const Seller = model.define("seller", {
  id: model.id().primaryKey(),
  handle: model.text().unique(),
  name: model.text(),
  logo: model.text().nullable(),
  description: model.text().nullable(),
  verification_status: model
    .enum(["unverified", "pending", "verified"])
    .default("unverified"),
  // platform commission as a fraction (0.1 = 10%), configurable per seller
  commission_rate: model.float().default(0.1),
  admins: model.hasMany(() => SellerAdmin, {
    mappedBy: "seller",
  }),
  commission_lines: model.hasMany(() => CommissionLine, {
    mappedBy: "seller",
  }),
})

export default Seller
```

- [ ] **Step 2: Create `backend/src/modules/marketplace/models/seller-admin.ts`:**

```ts
import { model } from "@medusajs/framework/utils"
import Seller from "./seller"

const SellerAdmin = model.define("seller_admin", {
  id: model.id().primaryKey(),
  first_name: model.text().nullable(),
  last_name: model.text().nullable(),
  email: model.text().unique(),
  seller: model.belongsTo(() => Seller, {
    mappedBy: "admins",
  }),
})

export default SellerAdmin
```

- [ ] **Step 3: Create `backend/src/modules/marketplace/models/commission-line.ts`:**

```ts
import { model } from "@medusajs/framework/utils"
import Seller from "./seller"

// One ledger line per seller order: what the platform keeps and owes.
const CommissionLine = model.define("commission_line", {
  id: model.id().primaryKey(),
  order_id: model.text().unique(),
  currency_code: model.text(),
  order_total: model.bigNumber(),
  rate: model.float(),
  commission_amount: model.bigNumber(),
  net_amount: model.bigNumber(),
  status: model.enum(["pending", "paid"]).default("pending"),
  seller: model.belongsTo(() => Seller, {
    mappedBy: "commission_lines",
  }),
})

export default CommissionLine
```

- [ ] **Step 4: Create `backend/src/modules/marketplace/service.ts`:**

```ts
import { MedusaService } from "@medusajs/framework/utils"
import Seller from "./models/seller"
import SellerAdmin from "./models/seller-admin"
import CommissionLine from "./models/commission-line"

class MarketplaceModuleService extends MedusaService({
  Seller,
  SellerAdmin,
  CommissionLine,
}) { }

export default MarketplaceModuleService
```

- [ ] **Step 5: Create `backend/src/modules/marketplace/index.ts`:**

```ts
import { Module } from "@medusajs/framework/utils"
import MarketplaceModuleService from "./service"

export const MARKETPLACE_MODULE = "marketplace"

export default Module(MARKETPLACE_MODULE, {
  service: MarketplaceModuleService,
})
```

- [ ] **Step 6: Register the module in `backend/medusa-config.ts`** — add as FIRST entry of the existing `modules` array (keep the Redis entries from Task 1):

```ts
  modules: [
    {
      resolve: "./src/modules/marketplace",
    },
    // ...existing Redis entries unchanged
  ],
```

- [ ] **Step 7: Generate and run the migration — FROM THE JUNCTION:**

```powershell
cd C:\Users\mosho\howsu-link\backend
$env:NODE_OPTIONS="--preserve-symlinks --preserve-symlinks-main"
npx medusa db:generate marketplace
npx medusa db:migrate
```

Expected: `db:generate` creates a file under `src\modules\marketplace\migrations\Migration*.ts`; `db:migrate` logs the marketplace migration as completed (NOT "already up-to-date" with zero pending — if it says up-to-date without running the new migration, the glob bug hit: verify you are in the junction path with NODE_OPTIONS set).

Verify tables exist:

```powershell
docker exec howsu-postgres psql -U howsu -d howsu -c "\dt" | Select-String -Pattern "seller|commission"
```

Expected: `seller`, `seller_admin`, `commission_line` tables listed.

- [ ] **Step 8: Restart backend dev server (workspace path), confirm boot without errors, then commit**

```powershell
cd "C:\Users\mosho\Desktop\How's you"; git add backend/src/modules backend/medusa-config.ts; git commit -m "feat(backend): marketplace module with seller, seller admin, commission line models"
```

---

### Task 3: Module links — seller↔product, seller↔order

**Files:**
- Create: `backend/src/links/seller-product.ts`
- Create: `backend/src/links/seller-order.ts`

- [ ] **Step 1: Create `backend/src/links/seller-product.ts`:**

```ts
import { defineLink } from "@medusajs/framework/utils"
import MarketplaceModule from "../modules/marketplace"
import ProductModule from "@medusajs/medusa/product"

export default defineLink(
  MarketplaceModule.linkable.seller,
  {
    linkable: ProductModule.linkable.product.id,
    isList: true,
  }
)
```

- [ ] **Step 2: Create `backend/src/links/seller-order.ts`:**

```ts
import { defineLink } from "@medusajs/framework/utils"
import MarketplaceModule from "../modules/marketplace"
import OrderModule from "@medusajs/medusa/order"

export default defineLink(
  MarketplaceModule.linkable.seller,
  {
    linkable: OrderModule.linkable.order.id,
    isList: true,
  }
)
```

- [ ] **Step 3: Sync link tables — FROM THE JUNCTION:**

```powershell
cd C:\Users\mosho\howsu-link\backend
$env:NODE_OPTIONS="--preserve-symlinks --preserve-symlinks-main"
npx medusa db:migrate
```

Expected: log lines about syncing links (creates `marketplace_seller_product_product` and `marketplace_seller_order_order` link tables, names may vary).

- [ ] **Step 4: Commit**

```powershell
cd "C:\Users\mosho\Desktop\How's you"; git add backend/src/links; git commit -m "feat(backend): link seller to products and orders"
```

---

### Task 4: Seller onboarding — workflow, POST /sellers, GET /sellers/me, middlewares

**Files:**
- Create: `backend/src/workflows/marketplace/create-seller/steps/create-seller.ts`
- Create: `backend/src/workflows/marketplace/create-seller/steps/create-seller-admin.ts`
- Create: `backend/src/workflows/marketplace/create-seller/index.ts`
- Create: `backend/src/api/sellers/route.ts`
- Create: `backend/src/api/sellers/me/route.ts`
- Create: `backend/src/api/middlewares.ts`

- [ ] **Step 1: Create `backend/src/workflows/marketplace/create-seller/steps/create-seller.ts`:**

```ts
import {
  createStep,
  StepResponse,
} from "@medusajs/framework/workflows-sdk"
import { MARKETPLACE_MODULE } from "../../../../modules/marketplace"
import MarketplaceModuleService from "../../../../modules/marketplace/service"

type CreateSellerStepInput = {
  name: string
  handle?: string
  logo?: string
  description?: string
}

const createSellerStep = createStep(
  "create-seller",
  async (sellerData: CreateSellerStepInput, { container }) => {
    const marketplaceModuleService: MarketplaceModuleService =
      container.resolve(MARKETPLACE_MODULE)

    const seller = await marketplaceModuleService.createSellers(sellerData)

    return new StepResponse(seller, seller.id)
  },
  async (sellerId, { container }) => {
    if (!sellerId) {
      return
    }

    const marketplaceModuleService: MarketplaceModuleService =
      container.resolve(MARKETPLACE_MODULE)

    await marketplaceModuleService.deleteSellers(sellerId)
  }
)

export default createSellerStep
```

- [ ] **Step 2: Create `backend/src/workflows/marketplace/create-seller/steps/create-seller-admin.ts`:**

```ts
import {
  createStep,
  StepResponse,
} from "@medusajs/framework/workflows-sdk"
import MarketplaceModuleService from "../../../../modules/marketplace/service"
import { MARKETPLACE_MODULE } from "../../../../modules/marketplace"

type CreateSellerAdminStepInput = {
  email: string
  first_name?: string
  last_name?: string
  seller_id: string
}

const createSellerAdminStep = createStep(
  "create-seller-admin-step",
  async (adminData: CreateSellerAdminStepInput, { container }) => {
    const marketplaceModuleService: MarketplaceModuleService =
      container.resolve(MARKETPLACE_MODULE)

    const sellerAdmin = await marketplaceModuleService.createSellerAdmins(
      adminData
    )

    return new StepResponse(sellerAdmin, sellerAdmin.id)
  },
  async (sellerAdminId, { container }) => {
    if (!sellerAdminId) {
      return
    }

    const marketplaceModuleService: MarketplaceModuleService =
      container.resolve(MARKETPLACE_MODULE)

    await marketplaceModuleService.deleteSellerAdmins(sellerAdminId)
  }
)

export default createSellerAdminStep
```

- [ ] **Step 3: Create `backend/src/workflows/marketplace/create-seller/index.ts`:**

```ts
import {
  createWorkflow,
  WorkflowResponse,
  transform,
} from "@medusajs/framework/workflows-sdk"
import {
  setAuthAppMetadataStep,
  useQueryGraphStep,
} from "@medusajs/medusa/core-flows"
import createSellerAdminStep from "./steps/create-seller-admin"
import createSellerStep from "./steps/create-seller"

export type CreateSellerWorkflowInput = {
  name: string
  handle?: string
  logo?: string
  description?: string
  admin: {
    email: string
    first_name?: string
    last_name?: string
  }
  authIdentityId: string
}

const createSellerWorkflow = createWorkflow(
  "create-seller",
  function (input: CreateSellerWorkflowInput) {
    const seller = createSellerStep({
      name: input.name,
      handle: input.handle,
      logo: input.logo,
      description: input.description,
    })

    const sellerAdminData = transform({
      input,
      seller,
    }, (data) => {
      return {
        ...data.input.admin,
        seller_id: data.seller.id,
      }
    })

    const sellerAdmin = createSellerAdminStep(sellerAdminData)

    setAuthAppMetadataStep({
      authIdentityId: input.authIdentityId,
      actorType: "seller",
      value: sellerAdmin.id,
    })

    // @ts-ignore
    const { data: sellerWithAdmin } = useQueryGraphStep({
      entity: "seller",
      fields: ["id", "name", "handle", "logo", "description",
        "verification_status", "commission_rate", "admins.*"],
      filters: {
        id: seller.id,
      },
    })

    return new WorkflowResponse({
      seller: sellerWithAdmin[0],
    })
  }
)

export default createSellerWorkflow
```

- [ ] **Step 4: Create `backend/src/api/sellers/route.ts`:**

```ts
import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { MedusaError } from "@medusajs/framework/utils"
import { z } from "@medusajs/framework/zod"
import createSellerWorkflow, {
  CreateSellerWorkflowInput,
} from "../../workflows/marketplace/create-seller"

export const PostSellerCreateSchema = z.strictObject({
  name: z.string(),
  handle: z.string().optional(),
  logo: z.string().optional(),
  description: z.string().optional(),
  admin: z.strictObject({
    email: z.string(),
    first_name: z.string().optional(),
    last_name: z.string().optional(),
  }),
})

type RequestBody = z.infer<typeof PostSellerCreateSchema>

export const POST = async (
  req: AuthenticatedMedusaRequest<RequestBody>,
  res: MedusaResponse
) => {
  // If `actor_id` is present, the request is already authenticated
  // as an existing seller admin
  if (req.auth_context?.actor_id) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "Request already authenticated as a seller."
    )
  }

  const sellerData = req.validatedBody

  const { result } = await createSellerWorkflow(req.scope)
    .run({
      input: {
        ...sellerData,
        authIdentityId: req.auth_context.auth_identity_id,
      } as CreateSellerWorkflowInput,
    })

  res.json({
    seller: result.seller,
  })
}
```

- [ ] **Step 5: Create `backend/src/api/sellers/me/route.ts`:**

```ts
import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"

export const GET = async (
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) => {
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)

  const { data: [sellerAdmin] } = await query.graph({
    entity: "seller_admin",
    fields: ["id", "first_name", "last_name", "email", "seller.*"],
    filters: {
      id: [req.auth_context.actor_id],
    },
  })

  res.json({
    seller_admin: sellerAdmin,
  })
}
```

- [ ] **Step 6: Create `backend/src/api/middlewares.ts`:**

```ts
import {
  defineMiddlewares,
  authenticate,
  validateAndTransformBody,
} from "@medusajs/framework/http"
import { AdminCreateProduct } from "@medusajs/medusa/api/admin/products/validators"
import { PostSellerCreateSchema } from "./sellers/route"

export default defineMiddlewares({
  routes: [
    {
      matcher: "/sellers",
      method: ["POST"],
      middlewares: [
        authenticate("seller", ["session", "bearer"], {
          allowUnregistered: true,
        }),
        validateAndTransformBody(PostSellerCreateSchema),
      ],
    },
    {
      matcher: "/sellers/*",
      middlewares: [
        authenticate("seller", ["session", "bearer"]),
      ],
    },
    {
      matcher: "/sellers/products",
      method: ["POST"],
      middlewares: [
        validateAndTransformBody(AdminCreateProduct),
      ],
    },
  ],
})
```

(The `/sellers/products` matcher is added now so Task 5 only creates its route file.)

- [ ] **Step 7: Verify end-to-end with the dev server running (restart it first):**

```powershell
$reg = Invoke-RestMethod -Method Post -Uri http://localhost:9000/auth/seller/emailpass/register -ContentType "application/json" -Body '{"email":"demo-seller@howsu.local","password":"supersecret"}'
$seller = Invoke-RestMethod -Method Post -Uri http://localhost:9000/sellers -ContentType "application/json" -Headers @{Authorization="Bearer $($reg.token)"} -Body '{"name":"Demo Seller","handle":"demo-seller","admin":{"email":"demo-seller@howsu.local","first_name":"Demo","last_name":"Seller"}}'
$seller.seller
$login = Invoke-RestMethod -Method Post -Uri http://localhost:9000/auth/seller/emailpass -ContentType "application/json" -Body '{"email":"demo-seller@howsu.local","password":"supersecret"}'
Invoke-RestMethod -Uri http://localhost:9000/sellers/me -Headers @{Authorization="Bearer $($login.token)"}
```

Expected: seller object with `id`, `handle: demo-seller`, `commission_rate: 0.1`, `verification_status: unverified`, one admin; `/sellers/me` returns the admin with nested `seller`.

- [ ] **Step 8: Commit**

```powershell
cd "C:\Users\mosho\Desktop\How's you"; git add backend/src/workflows backend/src/api; git commit -m "feat(backend): seller onboarding with seller actor type auth"
```

---

### Task 5: Seller products — create/list under seller ownership

**Files:**
- Create: `backend/src/workflows/marketplace/create-seller-product/index.ts`
- Create: `backend/src/api/sellers/products/route.ts`

- [ ] **Step 1: Create `backend/src/workflows/marketplace/create-seller-product/index.ts`:**

```ts
import { CreateProductWorkflowInputDTO } from "@medusajs/framework/types"
import {
  createWorkflow,
  transform,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk"
import {
  createProductsWorkflow,
  CreateProductsWorkflowInput,
  createRemoteLinkStep,
  useQueryGraphStep,
} from "@medusajs/medusa/core-flows"
import { MARKETPLACE_MODULE } from "../../../modules/marketplace"
import { Modules } from "@medusajs/framework/utils"

type WorkflowInput = {
  seller_admin_id: string
  product: CreateProductWorkflowInputDTO
}

const createSellerProductWorkflow = createWorkflow(
  "create-seller-product",
  (input: WorkflowInput) => {
    // make the product available in the store's default sales channel
    const { data: stores } = useQueryGraphStep({
      entity: "store",
      fields: ["default_sales_channel_id"],
    })

    const productData = transform({
      input,
      stores,
    }, (data) => {
      return {
        products: [{
          ...data.input.product,
          sales_channels: [
            {
              id: data.stores[0].default_sales_channel_id,
            },
          ],
        }],
      }
    })

    const createdProducts = createProductsWorkflow.runAsStep({
      input: productData as CreateProductsWorkflowInput,
    })

    const { data: sellerAdmins } = useQueryGraphStep({
      entity: "seller_admin",
      fields: ["seller.id"],
      filters: {
        id: input.seller_admin_id,
      },
    }).config({ name: "retrieve-seller-admins" })

    const linksToCreate = transform({
      input,
      createdProducts,
      sellerAdmins,
    }, (data) => {
      return data.createdProducts.map((product) => {
        return {
          [MARKETPLACE_MODULE]: {
            seller_id: data.sellerAdmins[0].seller.id,
          },
          [Modules.PRODUCT]: {
            product_id: product.id,
          },
        }
      })
    })

    createRemoteLinkStep(linksToCreate)

    const { data: products } = useQueryGraphStep({
      entity: "product",
      fields: ["*", "variants.*"],
      filters: {
        id: createdProducts[0].id,
      },
    }).config({ name: "retrieve-products" })

    return new WorkflowResponse({
      product: products[0],
    })
  }
)

export default createSellerProductWorkflow
```

- [ ] **Step 2: Create `backend/src/api/sellers/products/route.ts`:**

```ts
import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { HttpTypes } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import createSellerProductWorkflow from "../../../workflows/marketplace/create-seller-product"

export const POST = async (
  req: AuthenticatedMedusaRequest<HttpTypes.AdminCreateProduct>,
  res: MedusaResponse
) => {
  const { result } = await createSellerProductWorkflow(req.scope)
    .run({
      input: {
        seller_admin_id: req.auth_context.actor_id,
        product: req.validatedBody,
      },
    })

  res.json({
    product: result.product,
  })
}

export const GET = async (
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) => {
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)

  const { data: [sellerAdmin] } = await query.graph({
    entity: "seller_admin",
    fields: ["seller.products.*"],
    filters: {
      id: [req.auth_context.actor_id],
    },
  })

  res.json({
    products: sellerAdmin.seller.products,
  })
}
```

- [ ] **Step 3: Verify (dev server restarted; `$login.token` from Task 4 Step 7, re-login if expired):**

```powershell
$body = '{"title":"Demo Ankara Tote","status":"published","options":[{"title":"Color","values":["Indigo"]}],"variants":[{"title":"Indigo Tote","prices":[{"currency_code":"ngn","amount":15000},{"currency_code":"eur","amount":10},{"currency_code":"usd","amount":12}],"manage_inventory":false,"options":{"Color":"Indigo"}}]}'
Invoke-RestMethod -Method Post -Uri http://localhost:9000/sellers/products -ContentType "application/json" -Headers @{Authorization="Bearer $($login.token)"} -Body $body
Invoke-RestMethod -Uri http://localhost:9000/sellers/products -Headers @{Authorization="Bearer $($login.token)"}
```

Expected: POST returns the created product with variants; GET returns exactly 1 product (only this seller's).

- [ ] **Step 4: Commit**

```powershell
cd "C:\Users\mosho\Desktop\How's you"; git add backend/src; git commit -m "feat(backend): seller product creation and listing with ownership links"
```

---

### Task 6: Order splitting + commission ledger — workflow and checkout route

**Files:**
- Create: `backend/src/workflows/marketplace/create-seller-orders/steps/group-seller-items.ts`
- Create: `backend/src/workflows/marketplace/create-seller-orders/steps/create-seller-orders.ts`
- Create: `backend/src/workflows/marketplace/create-seller-orders/steps/create-commission-lines.ts`
- Create: `backend/src/workflows/marketplace/create-seller-orders/index.ts`
- Create: `backend/src/api/store/carts/[id]/complete-marketplace/route.ts`

- [ ] **Step 1: Create `backend/src/workflows/marketplace/create-seller-orders/steps/group-seller-items.ts`:**

```ts
import {
  createStep,
  StepResponse,
} from "@medusajs/framework/workflows-sdk"
import { CartLineItemDTO } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, promiseAll } from "@medusajs/framework/utils"

export type GroupSellerItemsStepInput = {
  cart: {
    items?: CartLineItemDTO[]
  }
}

const groupSellerItemsStep = createStep(
  "group-seller-items",
  async ({ cart }: GroupSellerItemsStepInput, { container }) => {
    const query = container.resolve(ContainerRegistrationKeys.QUERY)

    const sellersItems: Record<string, CartLineItemDTO[]> = {}

    await promiseAll((cart.items || []).map(async (item) => {
      const { data: [product] } = await query.graph({
        entity: "product",
        fields: ["seller.*"],
        filters: {
          id: item.product_id || "",
        },
      })

      const sellerId = product.seller?.id

      if (!sellerId) {
        return
      }
      sellersItems[sellerId] = [
        ...(sellersItems[sellerId] || []),
        item,
      ]
    }))

    return new StepResponse({
      sellersItems,
    })
  }
)

export default groupSellerItemsStep
```

- [ ] **Step 2: Create `backend/src/workflows/marketplace/create-seller-orders/steps/create-seller-orders.ts`:**

```ts
import {
  createStep,
  StepResponse,
} from "@medusajs/framework/workflows-sdk"
import {
  CartLineItemDTO,
  OrderDTO,
  LinkDefinition,
  InferTypeOf,
} from "@medusajs/framework/types"
import { Modules, promiseAll } from "@medusajs/framework/utils"
import {
  cancelOrderWorkflow,
  createOrderWorkflow,
} from "@medusajs/medusa/core-flows"
import MarketplaceModuleService from "../../../../modules/marketplace/service"
import { MARKETPLACE_MODULE } from "../../../../modules/marketplace"
import Seller from "../../../../modules/marketplace/models/seller"

export type SellerOrder = (OrderDTO & {
  seller: InferTypeOf<typeof Seller>
})

type StepInput = {
  parentOrder: OrderDTO
  sellersItems: Record<string, CartLineItemDTO[]>
}

function prepareOrderData(
  items: CartLineItemDTO[],
  parentOrder: OrderDTO
) {
  return {
    items,
    metadata: {
      parent_order_id: parentOrder.id,
    },
    // inherit everything else from the parent order
    region_id: parentOrder.region_id,
    customer_id: parentOrder.customer_id,
    sales_channel_id: parentOrder.sales_channel_id,
    email: parentOrder.email,
    currency_code: parentOrder.currency_code,
    shipping_address_id: parentOrder.shipping_address?.id,
    billing_address_id: parentOrder.billing_address?.id,
    // for simplicity the parent's shipping method is copied to each
    // child order; per-seller shipping comes later
    shipping_methods: parentOrder.shipping_methods?.map((shippingMethod) => ({
      name: shippingMethod.name,
      amount: shippingMethod.amount,
      shipping_option_id: shippingMethod.shipping_option_id,
      data: shippingMethod.data,
      tax_lines: shippingMethod.tax_lines?.map((taxLine) => ({
        code: taxLine.code,
        rate: taxLine.rate,
        provider_id: taxLine.provider_id,
        tax_rate_id: taxLine.tax_rate_id,
        description: taxLine.description,
      })),
      adjustments: shippingMethod.adjustments?.map((adjustment) => ({
        code: adjustment.code,
        amount: adjustment.amount,
        description: adjustment.description,
        promotion_id: adjustment.promotion_id,
        provider_id: adjustment.provider_id,
      })),
    })),
  }
}

const createSellerOrdersStep = createStep(
  "create-seller-orders",
  async (
    { sellersItems, parentOrder }: StepInput,
    { container, context }
  ) => {
    const linkDefs: LinkDefinition[] = []
    const createdOrders: SellerOrder[] = []
    const sellerIds = Object.keys(sellersItems)

    const marketplaceModuleService: MarketplaceModuleService =
      container.resolve(MARKETPLACE_MODULE)

    const sellers = await marketplaceModuleService.listSellers({
      id: sellerIds,
    })

    if (sellerIds.length === 1) {
      // single-seller cart: the parent order IS the seller order
      linkDefs.push({
        [MARKETPLACE_MODULE]: {
          seller_id: sellers[0].id,
        },
        [Modules.ORDER]: {
          order_id: parentOrder.id,
        },
      })

      createdOrders.push({
        ...parentOrder,
        seller: sellers[0],
      })

      return new StepResponse({
        orders: createdOrders,
        linkDefs,
      }, {
        created_orders: [],
      })
    }

    try {
      await promiseAll(
        sellerIds.map(async (sellerId) => {
          const items = sellersItems[sellerId]
          const seller = sellers.find((s) => s.id === sellerId)!

          const { result: childOrder } = await createOrderWorkflow(
            container
          )
            .run({
              input: prepareOrderData(items, parentOrder),
              context,
            }) as unknown as { result: SellerOrder }

          childOrder.seller = seller
          createdOrders.push(childOrder)

          linkDefs.push({
            [MARKETPLACE_MODULE]: {
              seller_id: seller.id,
            },
            [Modules.ORDER]: {
              order_id: childOrder.id,
            },
          })
        })
      )
    } catch (e) {
      return StepResponse.permanentFailure(
        `An error occurred while creating seller orders: ${e}`,
        {
          created_orders: createdOrders,
        }
      )
    }

    return new StepResponse({
      orders: createdOrders,
      linkDefs,
    }, {
      created_orders: createdOrders,
    })
  },
  async (data, { container, context }) => {
    if (!data) {
      return
    }
    await promiseAll(data.created_orders.map((createdOrder) => {
      return cancelOrderWorkflow(container).run({
        input: {
          order_id: createdOrder.id,
        },
        context,
        container,
      })
    }))
  }
)

export default createSellerOrdersStep
```

- [ ] **Step 3: Create `backend/src/workflows/marketplace/create-seller-orders/steps/create-commission-lines.ts`:**

```ts
import {
  createStep,
  StepResponse,
} from "@medusajs/framework/workflows-sdk"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import MarketplaceModuleService from "../../../../modules/marketplace/service"
import { MARKETPLACE_MODULE } from "../../../../modules/marketplace"
import { SellerOrder } from "./create-seller-orders"

type StepInput = {
  orders: SellerOrder[]
}

const round2 = (n: number) => Math.round(n * 100) / 100

const createCommissionLinesStep = createStep(
  "create-commission-lines",
  async ({ orders }: StepInput, { container }) => {
    if (!orders?.length) {
      return new StepResponse([], [])
    }

    const query = container.resolve(ContainerRegistrationKeys.QUERY)
    const marketplaceModuleService: MarketplaceModuleService =
      container.resolve(MARKETPLACE_MODULE)

    // fetch computed totals for each seller order
    const { data: orderTotals } = await query.graph({
      entity: "order",
      fields: ["id", "total", "currency_code"],
      filters: {
        id: orders.map((order) => order.id),
      },
    })

    const linesData = orders.map((order) => {
      const totals = orderTotals.find((o) => o.id === order.id)!
      const total = Number(totals.total)
      const rate = order.seller.commission_rate
      const commission = round2(total * rate)

      return {
        order_id: order.id,
        currency_code: totals.currency_code,
        order_total: total,
        rate,
        commission_amount: commission,
        net_amount: round2(total - commission),
        seller_id: order.seller.id,
      }
    })

    const lines = await marketplaceModuleService.createCommissionLines(
      linesData
    )

    return new StepResponse(lines, lines.map((line) => line.id))
  },
  async (lineIds, { container }) => {
    if (!lineIds?.length) {
      return
    }

    const marketplaceModuleService: MarketplaceModuleService =
      container.resolve(MARKETPLACE_MODULE)

    await marketplaceModuleService.deleteCommissionLines(lineIds)
  }
)

export default createCommissionLinesStep
```

- [ ] **Step 4: Create `backend/src/workflows/marketplace/create-seller-orders/index.ts`:**

```ts
import {
  createWorkflow,
  when,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk"
import {
  useQueryGraphStep,
  createRemoteLinkStep,
  completeCartWorkflow,
  getOrderDetailWorkflow,
  acquireLockStep,
  releaseLockStep,
} from "@medusajs/medusa/core-flows"
import groupSellerItemsStep, {
  GroupSellerItemsStepInput,
} from "./steps/group-seller-items"
import createSellerOrdersStep from "./steps/create-seller-orders"
import createCommissionLinesStep from "./steps/create-commission-lines"
import sellerOrderLink from "../../../links/seller-order"

type WorkflowInput = {
  cart_id: string
}

const createSellerOrdersWorkflow = createWorkflow(
  "create-seller-orders",
  (input: WorkflowInput) => {
    const { data: carts } = useQueryGraphStep({
      entity: "cart",
      fields: ["id", "items.*"],
      filters: { id: input.cart_id },
      options: {
        throwIfKeyNotFound: true,
      },
    })

    acquireLockStep({
      key: input.cart_id,
      timeout: 2,
      ttl: 10,
    })

    const { id: orderId } = completeCartWorkflow.runAsStep({
      input: {
        id: carts[0].id,
      },
    })

    // idempotency: if links already exist, this cart was already split
    const { data: existingLinks } = useQueryGraphStep({
      entity: sellerOrderLink.entryPoint,
      fields: ["seller.id"],
      filters: { order_id: orderId },
    }).config({ name: "retrieve-existing-links" })

    const order = getOrderDetailWorkflow.runAsStep({
      input: {
        order_id: orderId,
        fields: [
          "region_id",
          "customer_id",
          "sales_channel_id",
          "email",
          "currency_code",
          "shipping_address.*",
          "billing_address.*",
          "shipping_methods.*",
          "shipping_methods.tax_lines.*",
          "shipping_methods.adjustments.*",
        ],
      },
    })

    const sellerOrders = when(
      "create-seller-order-links",
      { existingLinks },
      (data) => data.existingLinks.length === 0
    ).then(() => {
      const { sellersItems } = groupSellerItemsStep({
        cart: carts[0],
      } as unknown as GroupSellerItemsStepInput)

      const {
        orders: sellerOrders,
        linkDefs,
      } = createSellerOrdersStep({
        parentOrder: order,
        sellersItems,
      })

      createRemoteLinkStep(linkDefs)

      createCommissionLinesStep({
        orders: sellerOrders,
      })

      return sellerOrders
    })

    releaseLockStep({
      key: input.cart_id,
    })

    return new WorkflowResponse({
      order,
      sellerOrders,
    })
  }
)

export default createSellerOrdersWorkflow
```

- [ ] **Step 5: Create `backend/src/api/store/carts/[id]/complete-marketplace/route.ts`:**

```ts
import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import createSellerOrdersWorkflow from "../../../../../workflows/marketplace/create-seller-orders"

export const POST = async (
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) => {
  const cartId = req.params.id

  const { result } = await createSellerOrdersWorkflow(req.scope)
    .run({
      input: {
        cart_id: cartId,
      },
    })

  res.json({
    type: "order",
    order: result.order,
  })
}
```

- [ ] **Step 6: TypeScript check + dev server boot check**

Run from `"C:\Users\mosho\Desktop\How's you\backend"`: `npx tsc --noEmit`
Expected: no errors in `src/workflows/marketplace/**` or `src/api/**` (pre-existing starter errors, if any, are out of scope). Restart dev server; boot must be clean. (Behavioral verification happens in Task 8's integration test.)

- [ ] **Step 7: Commit**

```powershell
cd "C:\Users\mosho\Desktop\How's you"; git add backend/src; git commit -m "feat(backend): order splitting into seller orders with commission ledger"
```

---

### Task 7: Seller read APIs — orders and commissions

**Files:**
- Create: `backend/src/api/sellers/orders/route.ts`
- Create: `backend/src/api/sellers/commissions/route.ts`

- [ ] **Step 1: Create `backend/src/api/sellers/orders/route.ts`:**

```ts
import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { getOrdersListWorkflow } from "@medusajs/medusa/core-flows"

export const GET = async (
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) => {
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)

  const { data: [sellerAdmin] } = await query.graph({
    entity: "seller_admin",
    fields: ["seller.orders.*"],
    filters: {
      id: [req.auth_context.actor_id],
    },
  })

  const orderIds = sellerAdmin.seller.orders?.map((order) => order?.id) || []

  if (!orderIds.length) {
    return res.json({ orders: [] })
  }

  const { result: orders } = await getOrdersListWorkflow(req.scope)
    .run({
      input: {
        fields: [
          "metadata",
          "total",
          "subtotal",
          "shipping_total",
          "tax_total",
          "items.*",
          "items.variant",
          "items.variant.product",
          "items.detail",
          "shipping_methods",
          "payment_collections",
          "fulfillments",
        ],
        variables: {
          filters: {
            id: orderIds,
          },
        },
      },
    })

  res.json({
    orders,
  })
}
```

- [ ] **Step 2: Create `backend/src/api/sellers/commissions/route.ts`:**

```ts
import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"

export const GET = async (
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) => {
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)

  const { data: [sellerAdmin] } = await query.graph({
    entity: "seller_admin",
    fields: [
      "seller.id",
      "seller.commission_rate",
      "seller.commission_lines.*",
    ],
    filters: {
      id: [req.auth_context.actor_id],
    },
  })

  const lines = sellerAdmin.seller.commission_lines || []

  // simple aggregate so sellers see what they're owed at a glance
  const totals = lines.reduce(
    (acc, line) => {
      if (!line) {
        return acc
      }
      acc.gross += Number(line.order_total)
      acc.commission += Number(line.commission_amount)
      acc.net += Number(line.net_amount)
      return acc
    },
    { gross: 0, commission: 0, net: 0 }
  )

  res.json({
    commission_rate: sellerAdmin.seller.commission_rate,
    summary: totals,
    commission_lines: lines,
  })
}
```

- [ ] **Step 3: Verify (dev server restarted; both routes are covered by the `/sellers/*` authenticate middleware already):**

```powershell
$login = Invoke-RestMethod -Method Post -Uri http://localhost:9000/auth/seller/emailpass -ContentType "application/json" -Body '{"email":"demo-seller@howsu.local","password":"supersecret"}'
Invoke-RestMethod -Uri http://localhost:9000/sellers/orders -Headers @{Authorization="Bearer $($login.token)"}
Invoke-RestMethod -Uri http://localhost:9000/sellers/commissions -Headers @{Authorization="Bearer $($login.token)"}
```

Expected: `/sellers/orders` returns `{ orders: [] }` (no orders yet); `/sellers/commissions` returns `commission_rate: 0.1`, zeroed `summary`, empty `commission_lines`. Unauthenticated requests to both must return 401.

- [ ] **Step 4: Commit**

```powershell
cd "C:\Users\mosho\Desktop\How's you"; git add backend/src/api; git commit -m "feat(backend): seller orders and commissions read APIs"
```

---

### Task 8: Integration test — order splitting & commission ledger

**Files:**
- Create: `backend/integration-tests/http/marketplace.spec.ts`

The starter already has `integration-tests/http/health.spec.ts` and `npm run test:integration:http` (jest + `@medusajs/test-utils`). Follow the existing pattern (`medusaIntegrationTestRunner`).

- [ ] **Step 1: Read the existing test setup**

Read `backend/integration-tests/http/health.spec.ts` and `backend/package.json` scripts to match the established runner pattern exactly.

- [ ] **Step 2: Create `backend/integration-tests/http/marketplace.spec.ts`:**

```ts
import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
import { MARKETPLACE_MODULE } from "../../src/modules/marketplace"
import MarketplaceModuleService from "../../src/modules/marketplace/service"

jest.setTimeout(120 * 1000)

medusaIntegrationTestRunner({
  inApp: true,
  env: {},
  testSuite: ({ api, getContainer }) => {
    describe("Marketplace module", () => {
      let marketplaceService: MarketplaceModuleService

      beforeAll(() => {
        marketplaceService = getContainer().resolve(MARKETPLACE_MODULE)
      })

      describe("sellers", () => {
        it("creates a seller with defaults", async () => {
          const seller = await marketplaceService.createSellers({
            name: "Test Seller",
            handle: "test-seller",
          })

          expect(seller.id).toBeTruthy()
          expect(seller.verification_status).toEqual("unverified")
          expect(seller.commission_rate).toEqual(0.1)
        })

        it("rejects duplicate handles", async () => {
          await marketplaceService.createSellers({
            name: "Seller A",
            handle: "dup-handle",
          })

          await expect(
            marketplaceService.createSellers({
              name: "Seller B",
              handle: "dup-handle",
            })
          ).rejects.toThrow()
        })
      })

      describe("commission lines", () => {
        it("records a commission line and enforces one line per order", async () => {
          const seller = await marketplaceService.createSellers({
            name: "Ledger Seller",
            handle: "ledger-seller",
            commission_rate: 0.15,
          })

          const line = await marketplaceService.createCommissionLines({
            order_id: "order_test_1",
            currency_code: "ngn",
            order_total: 20000,
            rate: 0.15,
            commission_amount: 3000,
            net_amount: 17000,
            seller_id: seller.id,
          })

          expect(line.status).toEqual("pending")
          expect(Number(line.commission_amount)).toEqual(3000)
          expect(Number(line.net_amount)).toEqual(17000)

          await expect(
            marketplaceService.createCommissionLines({
              order_id: "order_test_1",
              currency_code: "ngn",
              order_total: 100,
              rate: 0.15,
              commission_amount: 15,
              net_amount: 85,
              seller_id: seller.id,
            })
          ).rejects.toThrow()
        })
      })

      describe("seller auth + APIs", () => {
        let token: string

        it("onboards a seller through the API", async () => {
          const register = await api.post("/auth/seller/emailpass/register", {
            email: "api-seller@howsu.local",
            password: "supersecret",
          })

          expect(register.status).toEqual(200)

          const created = await api.post(
            "/sellers",
            {
              name: "API Seller",
              handle: "api-seller",
              admin: {
                email: "api-seller@howsu.local",
                first_name: "Api",
                last_name: "Seller",
              },
            },
            {
              headers: {
                Authorization: `Bearer ${register.data.token}`,
              },
            }
          )

          expect(created.status).toEqual(200)
          expect(created.data.seller.handle).toEqual("api-seller")
          expect(created.data.seller.admins).toHaveLength(1)

          const login = await api.post("/auth/seller/emailpass", {
            email: "api-seller@howsu.local",
            password: "supersecret",
          })

          expect(login.status).toEqual(200)
          token = login.data.token
        })

        it("returns the authenticated seller admin from /sellers/me", async () => {
          const me = await api.get("/sellers/me", {
            headers: { Authorization: `Bearer ${token}` },
          })

          expect(me.status).toEqual(200)
          expect(me.data.seller_admin.email).toEqual("api-seller@howsu.local")
          expect(me.data.seller_admin.seller.handle).toEqual("api-seller")
        })

        it("rejects unauthenticated access to seller routes", async () => {
          await expect(api.get("/sellers/me")).rejects.toMatchObject({
            response: { status: 401 },
          })
        })

        it("creates a product owned by the seller and lists it back", async () => {
          const created = await api.post(
            "/sellers/products",
            {
              title: "Test Owned Product",
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
            {
              headers: { Authorization: `Bearer ${token}` },
            }
          )

          expect(created.status).toEqual(200)
          expect(created.data.product.title).toEqual("Test Owned Product")

          const list = await api.get("/sellers/products", {
            headers: { Authorization: `Bearer ${token}` },
          })

          expect(list.status).toEqual(200)
          expect(list.data.products).toHaveLength(1)
          expect(list.data.products[0].id).toEqual(created.data.product.id)
        })

        it("starts with an empty commissions ledger", async () => {
          const commissions = await api.get("/sellers/commissions", {
            headers: { Authorization: `Bearer ${token}` },
          })

          expect(commissions.status).toEqual(200)
          expect(commissions.data.commission_lines).toHaveLength(0)
          expect(commissions.data.summary).toEqual({
            gross: 0,
            commission: 0,
            net: 0,
          })
        })
      })
    })
  },
})
```

Note: if the existing `health.spec.ts` pattern differs (e.g. no `inApp` flag, different runner options), match the existing pattern — the assertions above stay the same.

- [ ] **Step 3: Run the integration tests — FROM THE JUNCTION:**

```powershell
cd C:\Users\mosho\howsu-link\backend
$env:NODE_OPTIONS="--preserve-symlinks --preserve-symlinks-main"
npm run test:integration:http
```

Expected: all marketplace tests PASS (and the pre-existing health test still passes). The runner provisions a throwaway test database — Docker Postgres must be up.

If the runner fails on module resolution from the symlinked path, retry once from `"C:\Users\mosho\Desktop\How's you\backend"` without NODE_OPTIONS — jest may not hit the glob bug. Whichever path passes is acceptable; record which one worked in the task report.

- [ ] **Step 4: Commit**

```powershell
cd "C:\Users\mosho\Desktop\How's you"; git add backend/integration-tests; git commit -m "test(backend): marketplace integration tests for sellers, ownership, ledger"
```

---

### Task 9: End-to-end order-splitting proof + docs

**Files:**
- Modify: `frontend/src/lib/data/cart.ts` (switch cart completion to the marketplace route)
- Modify: `README.md` (add seller API quick reference)

- [ ] **Step 1: Point the storefront checkout at the marketplace completion route**

In `frontend/src/lib/data/cart.ts`, find:

```ts
const cartRes = await sdk.store.cart
  .complete(id, {}, headers)
```

and replace that call with:

```ts
const cartRes = await sdk.client.fetch<HttpTypes.StoreCompleteCartResponse>(
  `/store/carts/${id}/complete-marketplace`, {
    method: "POST",
    headers,
  })
```

keeping the existing `.then(...)/.catch(medusaError)` chain exactly as-is. Add the `HttpTypes` import if it's not already imported in that file.

- [ ] **Step 2: E2E proof via API (no browser needed)**

With the dev server running, drive a full checkout through the store API in PowerShell. Use header `x-publishable-api-key: pk_8820ed0de510671f9a9e4ea408ac5203410286c787d784d71728649cefff7a78` on ALL `/store/*` calls.

1. Create a second seller (`demo-seller-2`: register + `/sellers` + login, email `demo-seller2@howsu.local`) and one product for it (title "Second Seller Lamp", ngn/eur/usd prices) using the Task 4/5 verification commands.
2. `GET /store/regions` → pick a region id.
3. `POST /store/carts` with `{"region_id": "..."}` → cart id.
4. Find variant ids of BOTH sellers' products via `GET /store/products?fields=*variants`, add one of each: `POST /store/carts/{id}/line-items` with `{"variant_id":"...","quantity":1}`.
5. `POST /store/carts/{id}` with `{"email":"buyer@howsu.local"}` and a shipping/billing address payload; list shipping options `GET /store/shipping-options?cart_id=...`; add one via `POST /store/carts/{id}/shipping-methods` with `{"option_id":"..."}`.
6. Payment: `POST /store/payment-collections` with `{"cart_id":"..."}`, then `POST /store/payment-collections/{id}/payment-sessions` with `{"provider_id":"pp_system_default"}`.
7. Complete: `POST /store/carts/{id}/complete-marketplace` → expect `type: "order"`.
8. Verify the split: log in as EACH seller → `GET /sellers/orders` must show exactly 1 order each, containing ONLY that seller's item, with `metadata.parent_order_id` set (multi-seller path). `GET /sellers/commissions` → exactly 1 pending line each where `commission_amount = round(order_total * 0.1, 2)` and `net_amount = order_total - commission_amount`.

Expected: both sellers see only their own order and ledger line; the math checks out. If any step 4xxs, read the error body (`$_.ErrorDetails.Message`) — missing publishable-key header or missing shipping method are the usual causes.

- [ ] **Step 3: Update `README.md`** — append this section at the end:

```markdown
## Marketplace API (Phase 2)

Sellers are a custom `seller` actor type. Flow:

1. `POST /auth/seller/emailpass/register` → registration JWT
2. `POST /sellers` (Bearer registration JWT) → create seller + admin
3. `POST /auth/seller/emailpass` → authenticated JWT
4. `GET /sellers/me` · `POST|GET /sellers/products` · `GET /sellers/orders` · `GET /sellers/commissions`

Checkout uses `POST /store/carts/:id/complete-marketplace`: carts spanning N sellers
produce 1 parent order + N child seller orders, and a pending commission line
(default 10%, per-seller `commission_rate`) is recorded for each seller order.
```

- [ ] **Step 4: Commit**

```powershell
cd "C:\Users\mosho\Desktop\How's you"; git add README.md frontend/src/lib/data/cart.ts; git commit -m "feat: route checkout through marketplace completion; document seller APIs"
```

---

## Self-Review Notes

- Spec coverage: Seller entity ✅ (Task 2), product ownership ✅ (Tasks 3+5), order splitting ✅ (Task 6), commission engine + ledger ✅ (Tasks 2+6+7), integration tests for splitting/commission/ledger ✅ (Tasks 8+9), Redis reviewer finding ✅ (Task 1). Payouts are explicitly a later phase per spec.
- Naming is consistently `seller`/`seller_admin`/`commission_line`, actor type `seller`, module constant `MARKETPLACE_MODULE = "marketplace"` throughout.
- All `db:*` and test commands routed through the junction path per the apostrophe hazard.

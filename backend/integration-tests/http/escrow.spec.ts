import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
import {
  ContainerRegistrationKeys,
  Modules,
} from "@medusajs/framework/utils"
import { MARKETPLACE_MODULE } from "../../src/modules/marketplace"
import MarketplaceModuleService from "../../src/modules/marketplace/service"

jest.setTimeout(120 * 1000)

// Deterministic offline mock mode; real 3-day window + 30-day fallback so the
// escrow clock itself is under test (sweeps use an injected `now`).
process.env.PAYSTACK_SECRET_KEY = "mock"
process.env.CIRCLE_API_KEY = "mock"
process.env.CRYPTO_ENABLED = "true"
process.env.ESCROW_RETURN_WINDOW_DAYS = "3"
process.env.ESCROW_FALLBACK_RELEASE_DAYS = "30"
process.env.PAYOUT_MIN_NGN = "1"
process.env.PAYOUT_SCHEDULE_ENABLED = "false"

const DAY_MS = 24 * 60 * 60 * 1000
const daysFromNow = (days: number) => new Date(Date.now() + days * DAY_MS)

/**
 * In-app: the full escrow lifecycle — delivery starts the window, buyer
 * confirmation releases, returns hold, seller return-receipt reverses, the
 * sweep releases due + stale lines, and released funds flow into payouts.
 */
medusaIntegrationTestRunner({
  inApp: true,
  env: {},
  testSuite: ({ api, getContainer, dbUtils }) => {
    describe("Escrow — release & returns lifecycle", () => {
      let marketplace: MarketplaceModuleService
      let token: string
      let sellerId: string
      let storeHeaders: { headers: Record<string, string> }

      const auth = () => ({ headers: { Authorization: `Bearer ${token}` } })

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

      const lineFor = async (orderId: string) => {
        const [line] = await marketplace.listCommissionLines({
          order_id: orderId,
        })
        return line
      }

      beforeAll(async () => {
        marketplace = getContainer().resolve(MARKETPLACE_MODULE)

        const register = await api.post("/auth/seller/emailpass/register", {
          email: "escrow-seller@howsu.local",
          password: "supersecret",
        })
        const created = await api.post(
          "/sellers",
          {
            name: "Escrow Seller",
            handle: "escrow-seller",
            admin: {
              email: "escrow-seller@howsu.local",
              first_name: "Escrow",
              last_name: "Seller",
            },
          },
          { headers: { Authorization: `Bearer ${register.data.token}` } }
        )
        sellerId = created.data.seller.id

        const login = await api.post("/auth/seller/emailpass", {
          email: "escrow-seller@howsu.local",
          password: "supersecret",
        })
        token = login.data.token

        const bank = await api.post(
          "/sellers/payout-accounts",
          { type: "bank_account", bank_code: "058", account_number: "0123456789" },
          auth()
        )
        expect(bank.status).toEqual(201)

        // store routes demand a publishable key — mint one directly
        const apiKeyModule = getContainer().resolve(Modules.API_KEY)
        const [pubKey] = await apiKeyModule.createApiKeys([
          { title: "escrow-spec", type: "publishable", created_by: "escrow-spec" },
        ])
        storeHeaders = { headers: { "x-publishable-api-key": pubKey.token } }

        // the runner restores the DB from a template before every test —
        // snapshot so the onboarded seller + key survive into each one
        await dbUtils.snapshot()
      })

      it("seller mark-delivered starts the return window, idempotently", async () => {
        const order = await seedOrder()

        const res = await api.post(
          `/sellers/orders/${order.id}/mark-delivered`,
          {},
          auth()
        )
        expect(res.status).toEqual(200)
        const [line] = res.data.lines
        expect(line.status).toEqual("pending")
        expect(line.delivered_at).toBeTruthy()
        const deliveredAt = new Date(line.delivered_at).getTime()
        const dueAt = new Date(line.release_due_at).getTime()
        expect(Math.round((dueAt - deliveredAt) / DAY_MS)).toEqual(3)

        // replay: delivered_at must not move
        const replay = await api.post(
          `/sellers/orders/${order.id}/mark-delivered`,
          {},
          auth()
        )
        expect(replay.data.lines[0].delivered_at).toEqual(line.delivered_at)
      })

      it("hides another seller's order behind a 404", async () => {
        const order = await seedOrder()

        const register = await api.post("/auth/seller/emailpass/register", {
          email: "escrow-intruder@howsu.local",
          password: "supersecret",
        })
        await api.post(
          "/sellers",
          {
            name: "Intruder",
            handle: "escrow-intruder",
            admin: {
              email: "escrow-intruder@howsu.local",
              first_name: "In",
              last_name: "Truder",
            },
          },
          { headers: { Authorization: `Bearer ${register.data.token}` } }
        )
        const login = await api.post("/auth/seller/emailpass", {
          email: "escrow-intruder@howsu.local",
          password: "supersecret",
        })

        await expect(
          api.post(
            `/sellers/orders/${order.id}/mark-delivered`,
            {},
            { headers: { Authorization: `Bearer ${login.data.token}` } }
          )
        ).rejects.toMatchObject({ response: { status: 404 } })

        const line = await lineFor(order.id)
        expect(line.delivered_at).toBeNull()
      })

      it("buyer confirm-receipt releases escrow immediately", async () => {
        const order = await seedOrder()

        await expect(
          api.post(
            `/store/orders/${order.id}/confirm-receipt`,
            { email: "wrong@howsu.local" },
            storeHeaders
          )
        ).rejects.toMatchObject({ response: { status: 404 } })

        const res = await api.post(
          `/store/orders/${order.id}/confirm-receipt`,
          { email: "buyer@howsu.local" },
          storeHeaders
        )
        expect(res.status).toEqual(200)
        const [line] = res.data.lines
        expect(line.status).toEqual("available")
        expect(line.confirmed_at).toBeTruthy()
        expect(line.available_at).toBeTruthy()

        // replay stays a no-op: still exactly one line, still available
        const replay = await api.post(
          `/store/orders/${order.id}/confirm-receipt`,
          { email: "buyer@howsu.local" },
          storeHeaders
        )
        expect(replay.data.lines).toHaveLength(1)
        expect(replay.data.lines[0].status).toEqual("available")
      })

      it("auto-releases after the return window expires", async () => {
        const order = await seedOrder()
        await api.post(`/sellers/orders/${order.id}/mark-delivered`, {}, auth())

        expect(await marketplace.releaseDueLines(new Date())).toEqual(0)
        expect(await marketplace.releaseDueLines(daysFromNow(4))).toEqual(1)

        const line = await lineFor(order.id)
        expect(line.status).toEqual("available")
      })

      it("holds funds when a return is requested inside the window", async () => {
        const order = await seedOrder()
        await api.post(`/sellers/orders/${order.id}/mark-delivered`, {}, auth())

        const res = await api.post(
          `/store/orders/${order.id}/request-return`,
          { email: "buyer@howsu.local", reason: "does not fit" },
          storeHeaders
        )
        expect(res.status).toEqual(200)
        const [line] = res.data.lines
        expect(line.status).toEqual("pending")
        expect(line.held_at).toBeTruthy()
        expect(line.hold_reason).toEqual("does not fit")

        // held lines never auto-release
        expect(await marketplace.releaseDueLines(daysFromNow(4))).toEqual(0)
      })

      it("seller return-received reverses the commission line", async () => {
        const order = await seedOrder()
        await api.post(`/sellers/orders/${order.id}/mark-delivered`, {}, auth())
        await api.post(
          `/store/orders/${order.id}/request-return`,
          { email: "buyer@howsu.local", reason: "changed my mind" },
          storeHeaders
        )

        const res = await api.post(
          `/sellers/orders/${order.id}/return-received`,
          {},
          auth()
        )
        expect(res.status).toEqual(200)
        expect(res.data.commission_line.status).toEqual("reversed")
        expect(res.data.commission_line.reversal_reason).toEqual(
          "return received by seller"
        )

        // the reversed line is excluded from balances entirely — with no
        // other lines the ngn bucket doesn't even exist
        const balance = await api.get("/sellers/balance", auth())
        expect(balance.data.balances.ngn).toBeUndefined()
      })

      it("buyer cancel-return lifts the hold and release resumes", async () => {
        const order = await seedOrder()
        await api.post(`/sellers/orders/${order.id}/mark-delivered`, {}, auth())
        await api.post(
          `/store/orders/${order.id}/request-return`,
          { email: "buyer@howsu.local", reason: "changed my mind" },
          storeHeaders
        )

        const res = await api.post(
          `/store/orders/${order.id}/cancel-return`,
          { email: "buyer@howsu.local" },
          storeHeaders
        )
        expect(res.status).toEqual(200)
        expect(res.data.lines[0].held_at).toBeNull()

        expect(await marketplace.releaseDueLines(daysFromNow(4))).toEqual(1)
      })

      it("rejects returns on non-returnable goods but releases on confirm", async () => {
        const order = await seedOrder({ nonReturnable: true })

        await expect(
          api.post(
            `/store/orders/${order.id}/request-return`,
            { email: "buyer@howsu.local", reason: "smells odd" },
            storeHeaders
          )
        ).rejects.toMatchObject({
          response: {
            status: 400,
            data: { message: expect.stringContaining("non-returnable") },
          },
        })

        const res = await api.post(
          `/store/orders/${order.id}/confirm-receipt`,
          { email: "buyer@howsu.local" },
          storeHeaders
        )
        expect(res.data.lines[0].status).toEqual("available")
      })

      it("keeps mixed orders returnable", async () => {
        const order = await seedOrder({
          nonReturnable: true,
          extraReturnableItem: true,
        })

        const res = await api.post(
          `/store/orders/${order.id}/request-return`,
          { email: "buyer@howsu.local", reason: "belt is torn" },
          storeHeaders
        )
        expect(res.status).toEqual(200)
        expect(res.data.lines[0].held_at).toBeTruthy()
      })

      it("rejects a return after escrow already released", async () => {
        const order = await seedOrder()
        await api.post(`/sellers/orders/${order.id}/mark-delivered`, {}, auth())
        expect(await marketplace.releaseDueLines(daysFromNow(4))).toEqual(1)

        await expect(
          api.post(
            `/store/orders/${order.id}/request-return`,
            { email: "buyer@howsu.local", reason: "too late now" },
            storeHeaders
          )
        ).rejects.toMatchObject({ response: { status: 409 } })
      })

      it("falls back to releasing never-delivered lines after 30 days", async () => {
        const order = await seedOrder()

        expect(await marketplace.releaseDueLines(daysFromNow(4))).toEqual(0)
        expect(await marketplace.releaseDueLines(daysFromNow(31))).toEqual(1)

        const line = await lineFor(order.id)
        expect(line.status).toEqual("available")
        expect(line.delivered_at).toBeNull()
      })

      it("feeds released escrow into the payout lifecycle", async () => {
        const order = await seedOrder()
        await api.post(
          `/store/orders/${order.id}/confirm-receipt`,
          { email: "buyer@howsu.local" },
          storeHeaders
        )

        const res = await api.post(
          "/sellers/payouts",
          { rail: "paystack", idempotency_key: "escrow-po-1" },
          auth()
        )
        expect(res.data.payout.status).toEqual("processing")
        expect(res.data.payout.amount).toEqual(9500)

        const line = await lineFor(order.id)
        expect(line.status).toEqual("reserved")
        expect(line.payout_id).toEqual(res.data.payout.id)
      })

      it("admin hold blocks release and release-now frees the funds", async () => {
        // service-level: the admin HTTP routes are one-liners over these
        // methods and are exercised in the Phase 6 live proof (admin JWT)
        const order = await seedOrder()
        await api.post(`/sellers/orders/${order.id}/mark-delivered`, {}, auth())

        const held = await marketplace.holdForReturn(order.id, "admin dispute")
        expect(held[0].held_at).toBeTruthy()
        expect(await marketplace.releaseDueLines(daysFromNow(4))).toEqual(0)

        const released = await marketplace.liftHold(order.id, {
          releaseNow: true,
        })
        expect(released[0].status).toEqual("available")
        expect(released[0].available_at).toBeTruthy()
      })

      it("keeps /health 200 (no regression)", async () => {
        const res = await api.get("/health")
        expect(res.status).toEqual(200)
      })
    })
  },
})

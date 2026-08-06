import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
import {
  ContainerRegistrationKeys,
  Modules,
} from "@medusajs/framework/utils"
import { MARKETPLACE_MODULE } from "../../src/modules/marketplace"
import MarketplaceModuleService from "../../src/modules/marketplace/service"
import { GROWTH_MODULE } from "../../src/modules/growth"
import GrowthModuleService from "../../src/modules/growth/service"
import { completeKycLadder } from "./helpers/complete-kyc"

jest.setTimeout(120 * 1000)

process.env.PAYSTACK_SECRET_KEY = "mock"
process.env.CIRCLE_API_KEY = "mock"
process.env.CRYPTO_ENABLED = "false"
process.env.REFERRAL_SELLER_REWARD_NGN = "2000"

medusaIntegrationTestRunner({
  inApp: true,
  env: {},
  testSuite: ({ api, getContainer, dbUtils }) => {
    describe("Growth — referral reward engine", () => {
      let marketplace: MarketplaceModuleService
      let growth: GrowthModuleService
      let token: string
      let sellerId: string
      let storeHeaders: { headers: Record<string, string> }

      const auth = () => ({ headers: { Authorization: `Bearer ${token}` } })

      // An order placed by `email`, with a (pending) commission line on the
      // seller — mirroring a marketplace checkout before escrow release.
      const seedOrderFor = async (email: string) => {
        const container = getContainer()
        const orderModule = container.resolve(Modules.ORDER)
        const link = container.resolve(ContainerRegistrationKeys.LINK)
        const [product] = await container
          .resolve(Modules.PRODUCT)
          .createProducts([{ title: "Growth Product", status: "published" }])
        const order = await orderModule.createOrders({
          currency_code: "ngn",
          email,
          items: [
            { title: product.title, product_id: product.id, quantity: 1, unit_price: 10000 },
          ],
        })
        await link.create([
          {
            [MARKETPLACE_MODULE]: { seller_id: sellerId },
            [Modules.ORDER]: { order_id: order.id },
          },
        ])
        const [line] = await marketplace.createCommissionLines([
          {
            order_id: order.id,
            parent_order_id: order.id,
            currency_code: "ngn",
            order_total: 10000,
            rate: 0.1,
            commission_amount: 1000,
            net_amount: 9000,
            seller_id: sellerId,
          },
        ])
        return { order, line }
      }

      const availableNgn = async () => {
        const b = await marketplace.getSellerBalance(sellerId)
        return b.ngn?.available ?? 0
      }

      beforeAll(async () => {
        marketplace = getContainer().resolve(MARKETPLACE_MODULE)
        growth = getContainer().resolve(GROWTH_MODULE)

        const register = await api.post("/auth/seller/emailpass/register", {
          email: "growth-seller@howsu.local",
          password: "supersecret",
        })
        await completeKycLadder(getContainer, "growth-seller@howsu.local", "+2348012300001")
        const created = await api.post(
          "/sellers",
          {
            name: "Growth Seller",
            handle: "growth-seller",
            admin: {
              email: "growth-seller@howsu.local",
              first_name: "Grow",
              last_name: "Seller",
            },
          },
          { headers: { Authorization: `Bearer ${register.data.token}` } }
        )
        sellerId = created.data.seller.id
        const login = await api.post("/auth/seller/emailpass", {
          email: "growth-seller@howsu.local",
          password: "supersecret",
        })
        token = login.data.token

        const apiKeyModule = getContainer().resolve(Modules.API_KEY)
        const [pubKey] = await apiKeyModule.createApiKeys([
          { title: "growth-spec", type: "publishable", created_by: "growth-spec" },
        ])
        storeHeaders = { headers: { "x-publishable-api-key": pubKey.token } }

        await dbUtils.snapshot()
      })

      it("creates a referral with an unguessable REF- code", async () => {
        const res = await api.post(
          "/sellers/referrals",
          { referee_email: "buyer@howsu.local" },
          auth()
        )
        expect(res.status).toEqual(201)
        expect(res.data.referral.code).toMatch(/^REF-/)
        expect(res.data.referral.status).toEqual("pending")
        expect(res.data.referral.referee_email).toEqual("buyer@howsu.local")
      })

      it("a second invite of the same email returns the same referral (no double)", async () => {
        const first = await api.post(
          "/sellers/referrals",
          { referee_email: "again@howsu.local" },
          auth()
        )
        const second = await api.post(
          "/sellers/referrals",
          { referee_email: "AGAIN@howsu.local" },
          auth()
        )
        expect(second.status).toEqual(201)
        expect(second.data.referral.id).toEqual(first.data.referral.id)
      })

      it("claim: binds the referee email; wrong email conflicts (409); unknown code 404", async () => {
        const created = await api.post(
          "/sellers/referrals",
          { referee_email: "referee-claim@howsu.local" },
          auth()
        )
        const code = created.data.referral.code

        const claim = await api.post(
          "/store/referrals",
          { code, email: "referee-claim@howsu.local" },
          storeHeaders
        )
        expect(claim.status).toEqual(200)
        expect(claim.data.referral.referee_email).toEqual("referee-claim@howsu.local")

        await expect(
          api.post(
            "/store/referrals",
            { code, email: "someone-else@howsu.local" },
            storeHeaders
          )
        ).rejects.toMatchObject({ response: { status: 409 } })

        await expect(
          api.post(
            "/store/referrals",
            { code: "REF-NOPE-NOPE-NOPE", email: "buyer@howsu.local" },
            storeHeaders
          )
        ).rejects.toMatchObject({ response: { status: 404 } })
      })

      it("pays ONLY after the referee's first transaction completes (escrow release)", async () => {
        const created = await api.post(
          "/sellers/referrals",
          { referee_email: "referee-paid@howsu.local" },
          auth()
        )
        const code = created.data.referral.code
        const { line } = await seedOrderFor("referee-paid@howsu.local")

        // pending order: referral stays pending, nothing paid
        const before = await api.get("/sellers/referrals", auth())
        const pendingRef = before.data.referrals.find((r) => r.code === code)
        expect(pendingRef.status).toEqual("pending")
        expect(await availableNgn()).toBeCloseTo(0, 2)

        // referee completes the transaction — escrow releases the line
        await marketplace.updateCommissionLines([
          { id: line.id, status: "available", available_at: new Date() },
        ])
        const after = await api.get("/sellers/referrals", auth())
        const paidRef = after.data.referrals.find((r) => r.code === code)
        expect(paidRef.status).toEqual("qualified")
        expect(Number(paidRef.reward_amount)).toEqual(2000)

        // 9000 released line + 2000 referral reward in the seller's balance
        expect(await availableNgn()).toBeCloseTo(11000, 2)
      })

      it("a pending referral never qualifies without a completed transaction", async () => {
        await api.post(
          "/sellers/referrals",
          { referee_email: "no-order@howsu.local" },
          auth()
        )
        await api.post(
          "/sellers/referrals",
          { referee_email: "pending-order@howsu.local" },
          auth()
        )
        await seedOrderFor("pending-order@howsu.local") // order but NOT released

        const res = await api.get("/sellers/referrals", auth())
        const pending = res.data.referrals.filter((r) => r.status === "pending")
        expect(pending.map((r) => r.referee_email).sort()).toEqual(
          ["no-order@howsu.local", "pending-order@howsu.local"].sort()
        )
        expect(await availableNgn()).toBeCloseTo(0, 2)
      })

      it("qualification is idempotent — one referral can only ever pay once", async () => {
        await api.post(
          "/sellers/referrals",
          { referee_email: "referee-idem@howsu.local" },
          auth()
        )
        const { line } = await seedOrderFor("referee-idem@howsu.local")
        await marketplace.updateCommissionLines([
          { id: line.id, status: "available", available_at: new Date() },
        ])

        await api.get("/sellers/referrals", auth())
        await api.get("/sellers/referrals", auth())
        const res = await api.get("/sellers/referrals", auth())
        const qualified = res.data.referrals.filter(
          (r) => r.status === "qualified"
        )
        expect(qualified).toHaveLength(1)
        expect(await availableNgn()).toBeCloseTo(9000 + 2000, 2)
        expect(res.data.stats.qualified_count).toEqual(1)
        expect(res.data.stats.lifetime_earned).toEqual(2000)
      })

      it("an unreleased referee order never qualifies or pays", async () => {
        await api.post(
          "/sellers/referrals",
          { referee_email: "referee-second@howsu.local" },
          auth()
        )
        await seedOrderFor("referee-second@howsu.local")
        await api.get("/sellers/referrals", auth())
        // no completed transaction → nothing paid
        expect(await availableNgn()).toBeCloseTo(0, 2)
      })
    })
  },
})


import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
import {
  ContainerRegistrationKeys,
  Modules,
} from "@medusajs/framework/utils"
import { MARKETPLACE_MODULE } from "../../src/modules/marketplace"
import MarketplaceModuleService from "../../src/modules/marketplace/service"
import { completeKycLadder } from "./helpers/complete-kyc"

jest.setTimeout(120 * 1000)

// Products + commission lines only — no payout/stripe calls involved, but keep
// the money providers in offline mock mode so nothing accidentally hits a wire.
process.env.PAYSTACK_SECRET_KEY = "mock"
process.env.CIRCLE_API_KEY = "mock"

/**
 * In-app: the analytics aggregate is the money the seller can mention in a
 * pitch — daily/weekly/monthly trends, per-product sales (incl. the "not
 * selling" side of the catalog), and a sales journal built from commission
 * lines. Confirms reversed lines are excluded.
 */
medusaIntegrationTestRunner({
  inApp: true,
  env: {},
  testSuite: ({ api, getContainer, dbUtils }) => {
    describe("Seller analytics", () => {
      let marketplace: MarketplaceModuleService
      let sellerId: string
      let token: string
      let shoeId: string
      let lampId: string

      const auth = () => ({ headers: { Authorization: `Bearer ${token}` } })

      const seedOrder = async (productId: string, unitPrice = 10000) => {
        const container = getContainer()
        const orderModule = container.resolve(Modules.ORDER)
        const link = container.resolve(ContainerRegistrationKeys.LINK)

        const order = await orderModule.createOrders({
          currency_code: "ngn",
          email: "buyer@howsu.local",
          items: [
            {
              title: "Analytics item",
              product_id: productId,
              quantity: 1,
              unit_price: unitPrice,
            },
          ],
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
          order_total: unitPrice,
          rate: 0.05,
          commission_amount: unitPrice * 0.05,
          net_amount: unitPrice * 0.95,
          seller_id: sellerId,
        })

        return order
      }

      beforeAll(async () => {
        marketplace = getContainer().resolve(MARKETPLACE_MODULE)

        const register = await api.post("/auth/seller/emailpass/register", {
          email: "analytics-seller@howsu.local",
          password: "supersecret",
        })
        await completeKycLadder(
          getContainer,
          "analytics-seller@howsu.local",
          "+2348012300008"
        )
        const created = await api.post(
          "/sellers",
          {
            name: "Analytics Seller",
            handle: "analytics-seller",
            admin: {
              email: "analytics-seller@howsu.local",
              first_name: "Analytics",
              last_name: "Seller",
            },
          },
          { headers: { Authorization: `Bearer ${register.data.token}` } }
        )
        sellerId = created.data.seller.id

        const login = await api.post("/auth/seller/emailpass", {
          email: "analytics-seller@howsu.local",
          password: "supersecret",
        })
        token = login.data.token

        // Two products in the catalog: one sells, one never does.
        const productModule = getContainer().resolve(Modules.PRODUCT)
        const link = getContainer().resolve(ContainerRegistrationKeys.LINK)
        const [shoe, lamp] = await productModule.createProducts([
          { title: "Analytics Shoes", status: "published" as const },
          { title: "Desk Lamp (dusty)", status: "published" as const },
        ])
        shoeId = shoe.id
        lampId = lamp.id

        await link.create([
          {
            [MARKETPLACE_MODULE]: { seller_id: sellerId },
            [Modules.PRODUCT]: { product_id: shoeId },
          },
          {
            [MARKETPLACE_MODULE]: { seller_id: sellerId },
            [Modules.PRODUCT]: { product_id: lampId },
          },
        ])

        await dbUtils.snapshot()
      })

      it("returns trends, product performance and a journal for a seller", async () => {
        await seedOrder(shoeId, 10000)
        await seedOrder(shoeId, 10000)

        const res = await api.get(`/sellers/analytics`, auth())
        expect(res.status).toEqual(200)
        const data = res.data

        // No reversal seen → both orders counted.
        expect(data.overview.ngn).toMatchObject({
          gross: 20000,
          commission: 1000,
          net: 19000,
          orders: 2,
        })

        // Catalog surfaced: the seller's product is listed, the unsold one is not selling.
        const sold = data.products.find((p: any) => p.product_id === shoeId)
        const unsold = data.products.find((p: any) => p.product_id === lampId)
        expect(sold).toMatchObject({ units: 2, revenue: 20000, status: "published" })
        expect(unsold).toMatchObject({ units: 0, revenue: 0 })

        // Daily series have today's row populated, others exist and are zero-safe.
        const today = new Date().toISOString().slice(0, 10)
        const todayBucket = data.series.daily.find((b: any) => b.label === today)
        expect(todayBucket?.gross).toEqual(20000)
        expect(data.series.daily.length).toEqual(14)
        expect(data.series.weekly.length).toEqual(8)
        expect(data.series.monthly.length).toEqual(12)

        // Journal: two non-reversed lines, most "recent" settlement first.
        expect(data.journal.length).toEqual(2)
        expect(data.journal[0]).toMatchObject({ gross: 10000, net: 9500, status: "pending" })
      })

      it("excludes reversed commission lines from every aggregate", async () => {
        const order = await seedOrder(shoeId, 10000)
        const [line] = await marketplace.listCommissionLines({ order_id: order.id })
        await marketplace.updateCommissionLines({ id: line.id, status: "reversed" })

        const res = await api.get(`/sellers/analytics`, auth())
        expect(res.data.overview.ngn?.orders ?? 0).toEqual(0)
        expect(res.data.journal.length).toEqual(0)
      })

      it("rejects unauthenticated callers", async () => {
        let status = 0
        try {
          await api.get(`/sellers/analytics`)
        } catch (error: any) {
          status = error.response?.status ?? 0
        }
        expect(status).toEqual(401)
      })
    })
  },
})
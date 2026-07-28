import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
import { MARKETPLACE_MODULE } from "../../src/modules/marketplace"
import MarketplaceModuleService from "../../src/modules/marketplace/service"

jest.setTimeout(120 * 1000)

medusaIntegrationTestRunner({
  inApp: true,
  env: {},
  testSuite: ({ api, getContainer, dbUtils }) => {
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

          // The runner restores the database from a template before every
          // test. Snapshot here so the onboarded seller (and its auth
          // identity) survives into the remaining tests of this suite.
          await dbUtils.snapshot()
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
          expect(commissions.data.summary).toEqual({})
        })
      })
    })
  },
})

import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
import {
  ContainerRegistrationKeys,
  Modules,
} from "@medusajs/framework/utils"
import { MARKETPLACE_MODULE } from "../../src/modules/marketplace"
import MarketplaceModuleService from "../../src/modules/marketplace/service"
import { completeKycLadder } from "./helpers/complete-kyc"

jest.setTimeout(120 * 1000)

// Deterministic offline provider — the structured `result`/`proposal` fields
// come from real catalog/review reads in code, so they are assertable without
// a network or a model.
process.env.AI_PROVIDER = "mock"
process.env.AI_BUYER_CHAT_DAILY_LIMIT = "5"

const GUEST_KEY = "buyer-capabilities-guest-0001"

medusaIntegrationTestRunner({
  inApp: true,
  env: {},
  testSuite: ({ api, getContainer, dbUtils }) => {
    describe("buyer AI capabilities — grounded, read-only", () => {
      let marketplace: MarketplaceModuleService
      let token: string
      let sellerId: string
      let productId: string
      let storeHeaders: { headers: Record<string, string> }

      const auth = () => ({ headers: { Authorization: `Bearer ${token}` } })

      beforeAll(async () => {
        const container = getContainer()
        marketplace = container.resolve(MARKETPLACE_MODULE)

        const register = await api.post("/auth/seller/emailpass/register", {
          email: "ai-buyer@howsu.local",
          password: "supersecret",
        })
        await completeKycLadder(
          getContainer,
          "ai-buyer@howsu.local",
          "+2348012312345"
        )
        const created = await api.post(
          "/sellers",
          {
            name: "Buyer Cap Seller",
            handle: "buyer-cap-seller",
            admin: {
              email: "ai-buyer@howsu.local",
              first_name: "Cap",
              last_name: "Seller",
            },
          },
          { headers: { Authorization: `Bearer ${register.data.token}` } }
        )
        sellerId = created.data.seller.id

        const login = await api.post("/auth/seller/emailpass", {
          email: "ai-buyer@howsu.local",
          password: "supersecret",
        })
        token = login.data.token

        const apiKeyModule = container.resolve(Modules.API_KEY)
        const [pubKey] = await apiKeyModule.createApiKeys([
          { title: "ai-buyer-spec", type: "publishable", created_by: "spec" },
        ])
        storeHeaders = { headers: { "x-publishable-api-key": pubKey.token } }

        // one published, priced product owned by the seller
        const listed = await api.post(
          "/sellers/products",
          {
            title: "Wireless Earbuds Pro",
            status: "published",
            options: [{ title: "Size", values: ["One"] }],
            variants: [
              {
                title: "One Size",
                prices: [{ currency_code: "ngn", amount: 25000 }],
                manage_inventory: false,
                options: { Size: "One" },
              },
            ],
          },
          auth()
        )
        expect(listed.status).toEqual(200)
        productId = listed.data.product.id

        await dbUtils.snapshot()
      })

      const chat = async (message: string) =>
        api.post(
          "/store/ai/chat",
          { client_key: GUEST_KEY, message },
          storeHeaders
        )

      // A delivered order + commission line on the product, so a review can be
      // posted (same seeding pattern as reviews.spec).
      const seedDeliveredOrder = async (email: string) => {
        const container = getContainer()
        const orderModule = container.resolve(Modules.ORDER)
        const link = container.resolve(ContainerRegistrationKeys.LINK)

        const order = await orderModule.createOrders({
          currency_code: "ngn",
          email,
          items: [
            {
              title: "Wireless Earbuds Pro",
              product_id: productId,
              quantity: 1,
              unit_price: 25000,
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
          order_total: 25000,
          rate: 0.05,
          commission_amount: 1250,
          net_amount: 23750,
          seller_id: sellerId,
          delivered_at: new Date(),
          confirmed_at: new Date(),
        })

        return order
      }

      describe("product search intent", () => {
        it("returns the real catalog product with its price, grounded", async () => {
          const res = await chat("find me a wireless earbuds")

          expect(res.status).toEqual(200)
          expect(res.data.ok).toBe(true)
          expect(res.data.capability).toEqual("buyer_search")
          expect(res.data.proposal).toBeNull()

          const result = res.data.result
          expect(result.query).toEqual("find me a wireless earbuds")
          expect(result.products).toHaveLength(1)
          expect(result.products[0]).toMatchObject({
            product_id: productId,
            title: "Wireless Earbuds Pro",
            min_price: 25000,
            max_price: 25000,
            currency_code: "ngn",
            seller_name: "Buyer Cap Seller",
            variant_count: 1,
          })
          expect(result.products[0].best_variant_id).not.toBeNull()

          // the assistant reply is real prose, and the deterministic fact set
          // is in `result` (never hallucinated)
          expect(res.data.reply).toContain("Here’s a helpful answer")
        })
      })

      describe("price compare intent", () => {
        it("returns the matching product so the buyer can compare prices", async () => {
          const res = await chat("compare prices for wireless earbuds")

          expect(res.status).toEqual(200)
          expect(res.data.capability).toEqual("buyer_price_compare")
          expect(res.data.proposal).toBeNull()
          expect(res.data.result.products[0].title).toEqual(
            "Wireless Earbuds Pro"
          )
        })
      })

      describe("cart proposal intent", () => {
        it("returns an ADD proposal and never mutates a cart", async () => {
          const before = await getContainer()
            .resolve(Modules.CART)
            .listCarts()
          expect(before.length).toEqual(0)

          const res = await chat("add the wireless earbuds to my cart")

          expect(res.status).toEqual(200)
          expect(res.data.capability).toEqual("buyer_cart_proposal")
          expect(res.data.result.action).toEqual("add")
          expect(res.data.proposal).toEqual(res.data.result)
          expect(res.data.proposal).toMatchObject({
            action: "add",
            line_item_id: null,
            quantity: 1,
            title: "Wireless Earbuds Pro",
            price: 25000,
            currency_code: "ngn",
          })
          expect(res.data.proposal.variant_id).not.toBeNull()

          // the AI only PROPOSES — no cart, no order was created for the guest
          const after = await getContainer().resolve(Modules.CART).listCarts()
          expect(after.length).toEqual(0)
        })

        it("returns a REMOVE proposal for removal phrasing", async () => {
          const res = await chat("remove the wireless earbuds from my cart")

          expect(res.status).toEqual(200)
          expect(res.data.capability).toEqual("buyer_cart_proposal")
          expect(res.data.proposal.action).toEqual("remove")
          expect(res.data.proposal.line_item_id).toBeNull()
        })
      })

      describe("review summary intent", () => {
        it("aggregates REAL reviews for the product", async () => {
          const order = await seedDeliveredOrder("rev-buyer@howsu.local")
          const review = await api.post(
            `/store/orders/${order.id}/review`,
            {
              email: "rev-buyer@howsu.local",
              rating: 5,
              comment: "Great sound quality!",
              product_ratings: [{ product_id: productId, rating: 5 }],
            },
            storeHeaders
          )
          expect(review.status).toEqual(201)

          const res = await chat(
            "what do people say about the wireless earbuds?"
          )

          expect(res.status).toEqual(200)
          expect(res.data.capability).toEqual("buyer_review_summary")
          expect(res.data.proposal).toBeNull()
          expect(res.data.result).toMatchObject({
            product_id: productId,
            product_title: "Wireless Earbuds Pro",
            average_rating: 5,
            review_count: 1,
          })
          expect(res.data.result.recent_comments).toEqual([
            { rating: 5, comment: "Great sound quality!" },
          ])
        })
      })

      describe("general chat intent", () => {
        it("is a plain conversational turn — no capability, no grounded result", async () => {
          const res = await chat("hello there, thanks!")

          expect(res.status).toEqual(200)
          expect(res.data.capability).toBeNull()
          expect(res.data.result).toBeNull()
          expect(res.data.proposal).toBeNull()
          expect(res.data.reply).toContain("Here’s a helpful answer")
        })
      })
    })
  },
})

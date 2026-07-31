import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
import {
  ContainerRegistrationKeys,
  Modules,
} from "@medusajs/framework/utils"
import { MARKETPLACE_MODULE } from "../../src/modules/marketplace"
import MarketplaceModuleService from "../../src/modules/marketplace/service"
import { REVIEWS_MODULE } from "../../src/modules/reviews"
import ReviewsModuleService from "../../src/modules/reviews/service"
import {
  computeTrustScore,
  reconcileLines,
  tierFor,
} from "../../src/lib/reviews/trust-score"
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

      // Seed a delivered/undelivered seller order + commission line for the
      // shared product. delivered/confirmed set the corresponding timestamps.
      const seedOrder = async (opts: {
        email: string
        delivered?: boolean
        confirmed?: boolean
      }) => {
        const container = getContainer()
        const orderModule = container.resolve(Modules.ORDER)
        const link = container.resolve(ContainerRegistrationKeys.LINK)

        const order = await orderModule.createOrders({
          currency_code: "ngn",
          email: opts.email,
          items: [
            {
              title: "Reviewable Product",
              product_id: productId,
              quantity: 1,
              unit_price: 10000,
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
          order_total: 10000,
          rate: 0.05,
          commission_amount: 500,
          net_amount: 9500,
          seller_id: sellerId,
          delivered_at: opts.delivered ? new Date() : null,
          confirmed_at: opts.confirmed ? new Date() : null,
        })

        return order
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

      it("reconcileLines: a paid clawback relabels its base line reversed and drops the offset", () => {
        const now = new Date()
        const raw = [
          { order_id: "ord_1", status: "paid", delivered_at: now, confirmed_at: now, held_at: null, created_at: now },
          { order_id: "ord_1:reversal", status: "available", delivered_at: null, confirmed_at: null, held_at: null, created_at: now },
          { order_id: "ord_2", status: "available", delivered_at: now, confirmed_at: now, held_at: null, created_at: now },
        ]
        const reconciled = reconcileLines(raw)
        expect(reconciled).toHaveLength(2) // the :reversal offset is dropped
        expect(reconciled.filter((l) => l.status === "reversed")).toHaveLength(1)
        expect(reconciled.every((l) => l.delivered_at !== null)).toBe(true)
      })

      it("trust score: a paid clawback erodes dispute_health without inflating fulfillment", () => {
        const now = new Date()
        const raw = [
          ...Array.from({ length: 5 }, (_, i) => ({
            order_id: `ok_${i}`,
            status: "available",
            delivered_at: now,
            confirmed_at: now,
            held_at: null,
            created_at: now,
          })),
          { order_id: "clawed", status: "paid", delivered_at: now, confirmed_at: now, held_at: null, created_at: now },
          { order_id: "clawed:reversal", status: "available", delivered_at: null, confirmed_at: null, held_at: null, created_at: now },
        ]
        const lines = reconcileLines(raw)
        const r = computeTrustScore({ ratings: [5, 5, 5, 5, 5], lines, minOrders: 5 })
        const dh = r.breakdown.find((b) => b.key === "dispute_health")!
        expect(dh.value).toBeLessThan(100) // the clawback counts as a reversal
        const f = r.breakdown.find((b) => b.key === "fulfillment")!
        expect(f.value).toEqual(100) // the phantom offset didn't drag delivered-rate
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

      it("rejects a multi-seller parent order — review each store separately (400)", async () => {
        const orderModule = getContainer().resolve(Modules.ORDER)
        const [otherSeller] = await marketplace.createSellers([
          { name: "Other Store", handle: "other-store-multi" },
        ])
        const parent = await orderModule.createOrders({
          currency_code: "ngn",
          email: "buyer-multi@howsu.local",
          items: [
            {
              title: "Reviewable Product",
              product_id: productId,
              quantity: 1,
              unit_price: 10000,
            },
          ],
        })
        // Two seller lines under one parent and NO direct line for the parent
        // id — the route resolves both via parent_order_id and can't attribute
        // one score, so it must reject before the delivered gate.
        await marketplace.createCommissionLines({
          order_id: `${parent.id}-child-a`,
          parent_order_id: parent.id,
          currency_code: "ngn",
          order_total: 10000,
          rate: 0.05,
          commission_amount: 500,
          net_amount: 9500,
          seller_id: sellerId,
          delivered_at: new Date(),
        })
        await marketplace.createCommissionLines({
          order_id: `${parent.id}-child-b`,
          parent_order_id: parent.id,
          currency_code: "ngn",
          order_total: 10000,
          rate: 0.05,
          commission_amount: 500,
          net_amount: 9500,
          seller_id: otherSeller.id,
          delivered_at: new Date(),
        })
        const res = await api
          .post(
            `/store/orders/${parent.id}/review`,
            { email: "buyer-multi@howsu.local", rating: 5 },
            storeHeaders
          )
          .catch((e) => e.response)
        expect(res.status).toEqual(400)
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

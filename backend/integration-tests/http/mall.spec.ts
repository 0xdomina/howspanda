import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
import { Modules } from "@medusajs/framework/utils"
import { MALL_MODULE } from "../../src/modules/mall"
import MallModuleService from "../../src/modules/mall/service"
import { BUYER_WALLET_MODULE } from "../../src/modules/buyer-wallet"
import BuyerWalletModuleService from "../../src/modules/buyer-wallet/service"
import { completeKycLadder } from "./helpers/complete-kyc"

jest.setTimeout(240 * 1000)

process.env.PAYSTACK_SECRET_KEY = "mock"

// The test runner snapshots the database after the suite beforeAll and
// restores it before EVERY test. So shared fixtures (sellers, API key, the
// main mall) must be created in beforeAll, not in a previous test.

medusaIntegrationTestRunner({
  inApp: true,
  env: {},
  testSuite: ({ api, getContainer }) => {
    describe("Mall — bonding-curve marketplace (Phase 10)", () => {
      let mall: MallModuleService
      let buyerWallet: BuyerWalletModuleService
      let token: string
      let twoToken: string
      let sellerId: string
      let mallId: string
      let mallBuyerOrderId: string
      let drawBuyerOrderId: string
      let storeHeaders: { headers: Record<string, string> }

      const sellerAuth = () => ({
        headers: {
          Authorization: `Bearer ${token}`,
          ...storeHeaders.headers,
        },
      })

      const twoAuth = () => ({
        headers: {
          Authorization: `Bearer ${twoToken}`,
          ...storeHeaders.headers,
        },
      })

      beforeAll(async () => {
        mall = getContainer().resolve(MALL_MODULE)
        buyerWallet = getContainer().resolve(BUYER_WALLET_MODULE)

        const apiKeyModule = getContainer().resolve(Modules.API_KEY)
        const [pubKey] = await apiKeyModule.createApiKeys([
          { title: "mall-spec", type: "publishable", created_by: "mall-spec" },
        ])
        storeHeaders = { headers: { "x-publishable-api-key": pubKey.token } }

        const register = await api.post("/auth/seller/emailpass/register", {
          email: "mall-seller@howsu.local",
          password: "supersecret",
        })
        await completeKycLadder(getContainer, "mall-seller@howsu.local", "+2348012300002")
        const created = await api.post(
          "/sellers",
          {
            name: "Mall Seller",
            handle: "mall-seller",
            admin: {
              email: "mall-seller@howsu.local",
              first_name: "Mall",
              last_name: "Seller",
            },
          },
          { headers: { Authorization: `Bearer ${register.data.token}` } }
        )
        sellerId = created.data.seller.id
        const login = await api.post("/auth/seller/emailpass", {
          email: "mall-seller@howsu.local",
          password: "supersecret",
        })
        token = login.data.token

        const registerTwo = await api.post(
          "/auth/seller/emailpass/register",
          { email: "mall-seller-two@howsu.local", password: "supersecret" }
        )
        await completeKycLadder(getContainer, "mall-seller-two@howsu.local", "+2348012300003")
        await api.post(
          "/sellers",
          {
            name: "Mall Seller Two",
            handle: "mall-seller-two",
            admin: {
              email: "mall-seller-two@howsu.local",
              first_name: "Second",
              last_name: "Seller",
            },
          },
          {
            headers: {
              Authorization: `Bearer ${registerTwo.data.token}`,
            },
          }
        )
        twoToken = (
          await api.post("/auth/seller/emailpass", {
            email: "mall-seller-two@howsu.local",
            password: "supersecret",
          })
        ).data.token

        const createdMall = await api.post(
          "/store/malls",
          {
            name: "Test Mall",
            description: "A test mall",
            prizeWinnerCount: 3,
            prizeDistribution: "equal",
            prizePoolNgn: 30000,
          },
          sellerAuth()
        )
        mallId = createdMall.data.mall.id

        // The purchase route only credits a prize for a REAL order that
        // belongs to the buyer — seed real orders for both buyers.
        const orderModule = getContainer().resolve(Modules.ORDER)
        const [orderProduct] = await getContainer()
          .resolve(Modules.PRODUCT)
          .createProducts([{ title: "Mall Product", status: "published" }])
        const seedOrder = async (email: string) => {
          const order = await orderModule.createOrders({
            currency_code: "ngn",
            email,
            items: [
              { title: orderProduct.title, product_id: orderProduct.id, quantity: 1, unit_price: 1000 },
            ],
          })
          return order.id
        }
        mallBuyerOrderId = await seedOrder("mall-buyer@howsu.local")
        drawBuyerOrderId = await seedOrder("draw-buyer@howsu.local")
      })

      it("creates a pending mall with the bonding-curve defaults", async () => {
        const res = await api.post(
          "/store/malls",
          {
            name: "Fresh Mall",
            description: "A fresh mall",
            prizeWinnerCount: 3,
            prizeDistribution: "equal",
            prizePoolNgn: 30000,
          },
          sellerAuth()
        )
        expect(res.status).toEqual(201)
        expect(res.data.mall.status).toEqual("pending")
        expect(res.data.mall.created_by_seller_id).toEqual(sellerId)
        expect(res.data.mall.target_sellers).toEqual(5)
        expect(res.data.mall.target_buyers).toEqual(10)
        // the pool holds the net-of-tax amount (gross pledge × 0.8 platform tax)
        expect(Number(res.data.mall.prize_pool_ngn)).toEqual(24000)
      })

      it("lists the malls created or joined by the seller", async () => {
        const res = await api.get("/store/malls", sellerAuth())
        expect(res.status).toEqual(200)
        expect(Array.isArray(res.data.malls)).toEqual(true)
        const mine = res.data.malls.filter(
          (m) => m.created_by_seller_id === sellerId
        )
        expect(mine.length).toBeGreaterThan(0)
      })

      it("rejects unauthenticated seller mall creation", async () => {
        await expect(
          api.post(
            "/store/malls",
            {
              name: "No Auth",
              prizeWinnerCount: 1,
              prizeDistribution: "equal",
              prizePoolNgn: 1000,
            },
            storeHeaders
          )
        ).rejects.toMatchObject({ response: { status: 401 } })
      })

      it("lets a second seller join and grows the prize pool", async () => {
        const join = await api.post(
          `/store/malls/${mallId}/join`,
          { contributionNgn: 10000 },
          twoAuth()
        )
        expect(join.status).toEqual(201)
        expect(join.data.sellerJoin.contribution_ngn).toEqual(10000)

        const details = await api.get(`/store/malls/${mallId}`, storeHeaders)
        expect(details.data.mall.contributed_ngn).toBeGreaterThanOrEqual(10000)
      })

      it("browses active malls with only a publishable key", async () => {
        const res = await api.get("/store/malls/active", storeHeaders)
        expect(res.status).toEqual(200)
        expect(Array.isArray(res.data.malls)).toEqual(true)
      })

      it("registers buyer interest via join-buyer", async () => {
        const res = await api.post(
          `/store/malls/${mallId}/join-buyer`,
          { buyerEmail: "mall-buyer@howsu.local" },
          storeHeaders
        )
        expect(res.status).toEqual(201)
        expect(res.data.buyer.buyer_email).toEqual("mall-buyer@howsu.local")

        // a repeat join is idempotent (returns the existing buyer)
        const again = await api.post(
          `/store/malls/${mallId}/join-buyer`,
          { buyerEmail: "mall-buyer@howsu.local" },
          storeHeaders
        )
        expect(again.status).toEqual(201)
        expect(again.data.buyer.id).toEqual(res.data.buyer.id)
      })

      it("records a purchase on a pending mall without a prize draw", async () => {
        const res = await api.post(
          `/store/malls/${mallId}/purchase`,
          { buyerEmail: "mall-buyer@howsu.local", orderId: mallBuyerOrderId },
          storeHeaders
        )
        expect(res.status).toEqual(200)
        expect(res.data.result).toEqual(null)
      })

      it("admin go-live force-activates a pending mall", async () => {
        // admin route exercised at the service layer (thin-wrapper convention)
        const activated = await mall.activate(mallId)
        expect(activated.status).toEqual("active")
        expect(activated.starts_at).toBeDefined()
      })

      it("pays a luck prize into the buyer wallet on an active mall", async () => {
        const mallForDraw = await mall.createMall({
          name: "Draw Mall",
          createdBySellerId: sellerId,
          prizeWinnerCount: 1,
          prizeDistribution: "equal",
          prizePoolNgn: 20000,
        })
        await mall.joinAsSeller({
          mallId: mallForDraw.id,
          sellerId,
          contributionNgn: 5000,
        })
        for (let i = 2; i <= 5; i++) {
          await mall.joinAsSeller({
            mallId: mallForDraw.id,
            sellerId: `draw-seller-${i}`,
            contributionNgn: 1000,
          })
        }
        await mall.joinAsBuyer({
          mallId: mallForDraw.id,
          buyerEmail: "draw-buyer@howsu.local",
        })
        for (let i = 2; i <= 10; i++) {
          await mall.joinAsBuyer({
            mallId: mallForDraw.id,
            buyerEmail: `draw-buyer-${i}@howsu.local`,
          })
        }
        // thresholds met (1 seller + 1 buyer) → auto-active
        const active = await mall.getDetails(mallForDraw.id)
        expect(active.status).toEqual("active")

        const res = await api.post(
          `/store/malls/${mallForDraw.id}/purchase`,
          { buyerEmail: "draw-buyer@howsu.local", orderId: drawBuyerOrderId },
          storeHeaders
        )
        expect(res.status).toEqual(200)
        expect(res.data.result.won).toEqual(true)
        expect(res.data.result.prizeAmount).toBeGreaterThan(0)

        expect(await buyerWallet.balance("draw-buyer@howsu.local")).toBeGreaterThan(0)
      })

      it("a winning buyer can only win once per mall", async () => {
        const second = await mall.recordPurchase({
          mallId,
          buyerEmail: "mall-buyer@howsu.local",
          orderId: "order_mall_2",
        })
        // already won earlier OR still pending; either way no double-payout
        const prizes = await mall.listMallPrizes({ mall_id: mallId })
        const winsForBuyer = prizes.filter(
          (p) => p.winner_buyer_email === "mall-buyer@howsu.local"
        )
        expect(winsForBuyer.length).toBeLessThanOrEqual(1)
        expect(second).toBeNull()
      })

      it("replaying the same order for a mall is a no-op (no extra tickets)", async () => {
        const replayMall = await mall.createMall({
          name: "Replay Mall",
          createdBySellerId: sellerId,
          prizeWinnerCount: 1,
          prizeDistribution: "equal",
          prizePoolNgn: 20000,
        })
        await mall.joinAsSeller({
          mallId: replayMall.id,
          sellerId,
          contributionNgn: 5000,
        })
        for (let i = 2; i <= 5; i++) {
          await mall.joinAsSeller({
            mallId: replayMall.id,
            sellerId: `replay-seller-${i}`,
            contributionNgn: 1000,
          })
        }
        for (let i = 1; i <= 10; i++) {
          await mall.joinAsBuyer({
            mallId: replayMall.id,
            buyerEmail: `replay-buyer-${i}@howsu.local`,
          })
        }
        const active = await mall.getDetails(replayMall.id)
        expect(active.status).toEqual("active")

        // Same order twice — the (mall_id, order_id) dedupe must swallow the
        // second call regardless of whether the first draw won.
        await mall.recordPurchase({
          mallId: replayMall.id,
          buyerEmail: "replay-buyer-1@howsu.local",
          orderId: "order_replay_1",
        })
        await mall.recordPurchase({
          mallId: replayMall.id,
          buyerEmail: "replay-buyer-1@howsu.local",
          orderId: "order_replay_1",
        })

        const purchases = await mall.listMallPurchases({
          mall_id: replayMall.id,
          order_id: "order_replay_1",
        })
        expect(purchases.length).toEqual(1)
        const [buyer] = await mall.listMallBuyers({
          mall_id: replayMall.id,
          buyer_email: "replay-buyer-1@howsu.local",
        })
        expect(Number(buyer.purchase_count)).toEqual(1)
      })
    })
  },
})

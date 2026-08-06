import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
import {
  ContainerRegistrationKeys,
  Modules,
} from "@medusajs/framework/utils"
import { MARKETPLACE_MODULE } from "../../src/modules/marketplace"
import MarketplaceModuleService from "../../src/modules/marketplace/service"
import { TIPPING_MODULE } from "../../src/modules/tipping"
import TippingModuleService from "../../src/modules/tipping/service"
import { REDEEMABLES_MODULE } from "../../src/modules/redeemables"
import RedeemablesModuleService from "../../src/modules/redeemables/service"
import { completeKycLadder } from "./helpers/complete-kyc"

jest.setTimeout(120 * 1000)

// Mock payment/crypto so the app boots offline; no escrow clock needed here.
process.env.PAYSTACK_SECRET_KEY = "mock"
process.env.CIRCLE_API_KEY = "mock"
process.env.CRYPTO_ENABLED = "false"

medusaIntegrationTestRunner({
  inApp: true,
  env: {},
  testSuite: ({ api, getContainer, dbUtils }) => {
    describe("Tipping — buyer→seller & seller→buyer", () => {
      let marketplace: MarketplaceModuleService
      let tipping: TippingModuleService
      let redeemables: RedeemablesModuleService
      let token: string
      let sellerId: string
      let storeHeaders: { headers: Record<string, string> }

      const auth = () => ({ headers: { Authorization: `Bearer ${token}` } })

      // A buyer-visible order owned by the seller (order + commission line),
      // mirroring what a marketplace checkout produces.
      const seedOrder = async (email = "buyer@howsu.local") => {
        const container = getContainer()
        const orderModule = container.resolve(Modules.ORDER)
        const link = container.resolve(ContainerRegistrationKeys.LINK)
        const [product] = await container
          .resolve(Modules.PRODUCT)
          .createProducts([{ title: "Tipable Product", status: "published" }])
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
        await marketplace.createCommissionLines({
          order_id: order.id,
          parent_order_id: order.id,
          currency_code: "ngn",
          order_total: 10000,
          rate: 0.1,
          commission_amount: 1000,
          net_amount: 9000,
          seller_id: sellerId,
        })
        return order
      }

      const availableNgn = async () => {
        const b = await marketplace.getSellerBalance(sellerId)
        return b.ngn?.available ?? 0
      }

      beforeAll(async () => {
        marketplace = getContainer().resolve(MARKETPLACE_MODULE)
        tipping = getContainer().resolve(TIPPING_MODULE)
        redeemables = getContainer().resolve(REDEEMABLES_MODULE)

        const register = await api.post("/auth/seller/emailpass/register", {
          email: "tipping-seller@howsu.local",
          password: "supersecret",
        })
        await completeKycLadder(getContainer, "tipping-seller@howsu.local", "+2348012300011")
        const created = await api.post(
          "/sellers",
          {
            name: "Tipping Seller",
            handle: "tipping-seller",
            admin: {
              email: "tipping-seller@howsu.local",
              first_name: "Tip",
              last_name: "Seller",
            },
          },
          { headers: { Authorization: `Bearer ${register.data.token}` } }
        )
        sellerId = created.data.seller.id
        const login = await api.post("/auth/seller/emailpass", {
          email: "tipping-seller@howsu.local",
          password: "supersecret",
        })
        token = login.data.token

        const apiKeyModule = getContainer().resolve(Modules.API_KEY)
        const [pubKey] = await apiKeyModule.createApiKeys([
          { title: "tipping-spec", type: "publishable", created_by: "tipping-spec" },
        ])
        storeHeaders = { headers: { "x-publishable-api-key": pubKey.token } }

        await dbUtils.snapshot()
      })

      it("records a buyer→seller tip and settles it into the seller's available balance", async () => {
        const order = await seedOrder()
        const before = await availableNgn()

        const res = await api.post(
          `/store/orders/${order.id}/tip`,
          { email: "buyer@howsu.local", amount: 2500, note: "great service!" },
          storeHeaders
        )
        expect(res.status).toEqual(200)
        expect(res.data.tip.direction).toEqual("to_seller")
        expect(Number(res.data.tip.amount)).toEqual(2500)
        expect(res.data.tip.commission_line_id).toBeTruthy()

        // 10% platform fee → net 2250 lands in the seller's available balance
        expect(await availableNgn()).toBeCloseTo(before + 2250, 2)
      })

      it("rejects a buyer→seller tip when the email does not own the order (404)", async () => {
        const order = await seedOrder()
        await expect(
          api.post(
            `/store/orders/${order.id}/tip`,
            { email: "someone-else@howsu.local", amount: 500 },
            storeHeaders
          )
        ).rejects.toMatchObject({ response: { status: 404 } })
      })

      it("rejects a non-positive tip amount (400)", async () => {
        const order = await seedOrder()
        await expect(
          api.post(
            `/store/orders/${order.id}/tip`,
            { email: "buyer@howsu.local", amount: 0 },
            storeHeaders
          )
        ).rejects.toMatchObject({ response: { status: 400 } })
      })

      it("seller→buyer cash tip deducts from available and issues a buyer credit note", async () => {
        // fund the balance first with a buyer tip
        const order = await seedOrder()
        await api.post(
          `/store/orders/${order.id}/tip`,
          { email: "buyer@howsu.local", amount: 10000 },
          storeHeaders
        )
        const before = await availableNgn()

        const res = await api.post(
          "/sellers/tips",
          { buyer_email: "buyer@howsu.local", amount: 3000, note: "thanks for your order" },
          auth()
        )
        expect(res.status).toEqual(200)
        expect(res.data.tip.direction).toEqual("to_buyer")
        expect(Number(res.data.tip.amount)).toEqual(3000)
        expect(res.data.tip.buyer_credit_status).toEqual("issued")
        expect(res.data.tip.buyer_credit_code).toMatch(/^CR-/)
        expect(Number(await availableNgn())).toBeCloseTo(before - 3000, 2)
      })

      it("blocks a seller→buyer cash tip that exceeds the available balance (400)", async () => {
        await expect(
          api.post(
            "/sellers/tips",
            { buyer_email: "buyer@howsu.local", amount: 99999999 },
            auth()
          )
        ).rejects.toMatchObject({ response: { status: 400 } })
      })

      it("seller→buyer extra-product tip records the gift with no money moving", async () => {
        const before = await availableNgn()
        const res = await api.post(
          "/sellers/tips",
          { buyer_email: "buyer@howsu.local", product_id: "prod_extra", product_title: "Free Upgrade" },
          auth()
        )
        expect(res.status).toEqual(200)
        expect(res.data.tip.direction).toEqual("to_buyer")
        expect(res.data.tip.amount).toBeNull()
        expect(res.data.tip.product_title).toEqual("Free Upgrade")
        expect(res.data.tip.commission_line_id).toBeNull()
        expect(res.data.tip.buyer_credit_status).toBeNull()
        expect(await availableNgn()).toBeCloseTo(before, 2)
      })

      it("GET /sellers/tips lists tips with a summary", async () => {
        const order = await seedOrder()
        await api.post(
          `/store/orders/${order.id}/tip`,
          { email: "buyer@howsu.local", amount: 1500 },
          storeHeaders
        )
        await api.post(
          "/sellers/tips",
          { buyer_email: "buyer@howsu.local", product_id: "prod_b", product_title: "Bonus" },
          auth()
        )

        const res = await api.get("/sellers/tips", auth())
        expect(res.status).toEqual(200)
        expect(res.data.tips.length).toBeGreaterThan(0)
        expect(res.data.summary).toMatchObject({
          count: expect.any(Number),
          in_amount: expect.any(Number),
          out_amount: expect.any(Number),
          product_tips: expect.any(Number),
        })
        expect(res.data.summary.in_amount).toBeGreaterThan(0)
        expect(res.data.summary.product_tips).toBeGreaterThan(0)
      })

      it("seller→buyer tip with an own store code gifts it to the buyer; no money moves", async () => {
        const before = await availableNgn()
        const [card] = await redeemables.mintRedeemables({
          seller_id: sellerId,
          type: "gift_card",
          title: "Tip Card",
          face_value: 5000,
        })

        const res = await api.post(
          "/sellers/tips",
          { buyer_email: "buyer@howsu.local", redeemable_code: card.code },
          auth()
        )
        expect(res.status).toEqual(200)
        expect(res.data.tip.direction).toEqual("to_buyer")
        expect(res.data.tip.redeemable_code).toEqual(card.code)
        expect(res.data.tip.redeemable_id).toEqual(card.id)
        expect(res.data.tip.amount).toBeNull()
        expect(res.data.tip.commission_line_id).toBeNull()
        expect(res.data.tip.buyer_credit_status).toBeNull()
        // the code is now addressed to the buyer
        const [updated] = await redeemables.listRedeemables({ id: card.id })
        expect(updated.issued_to_email).toEqual("buyer@howsu.local")
        expect(await availableNgn()).toBeCloseTo(before, 2)
      })

      it("foreign or spent store codes are invisible when tipped (404)", async () => {
        // register a second seller with its own code
        const register = await api.post("/auth/seller/emailpass/register", {
          email: "other-tip-seller@howsu.local",
          password: "supersecret",
        })
        await completeKycLadder(getContainer, "other-tip-seller@howsu.local", "+2348012300012")
        const created = await api.post(
          "/sellers",
          {
            name: "Other Tip Seller",
            handle: "other-tip-seller",
            admin: {
              email: "other-tip-seller@howsu.local",
              first_name: "Other",
              last_name: "Seller",
            },
          },
          { headers: { Authorization: `Bearer ${register.data.token}` } }
        )
        const [foreign] = await redeemables.mintRedeemables({
          seller_id: created.data.seller.id,
          type: "voucher",
          title: "Foreign Voucher",
          discount_type: "fixed",
          discount_value: 1000,
        })

        await expect(
          api.post(
            "/sellers/tips",
            { buyer_email: "buyer@howsu.local", redeemable_code: foreign.code },
            auth()
          )
        ).rejects.toMatchObject({ response: { status: 404 } })

        // spent code (redeemed) is equally invisible
        const [spent] = await redeemables.mintRedeemables({
          seller_id: sellerId,
          type: "ticket",
          title: "Spent Ticket",
          face_value: 2000,
        })
        await redeemables.updateRedeemables([{ id: spent.id, status: "redeemed" }])
        await expect(
          api.post(
            "/sellers/tips",
            { buyer_email: "buyer@howsu.local", redeemable_code: spent.code },
            auth()
          )
        ).rejects.toMatchObject({ response: { status: 404 } })
      })
    })
  },
})

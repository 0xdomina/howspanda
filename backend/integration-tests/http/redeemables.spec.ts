import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
import {
  ContainerRegistrationKeys,
  Modules,
} from "@medusajs/framework/utils"
import { MARKETPLACE_MODULE } from "../../src/modules/marketplace"
import MarketplaceModuleService from "../../src/modules/marketplace/service"
import { REDEEMABLES_MODULE } from "../../src/modules/redeemables"
import RedeemablesModuleService from "../../src/modules/redeemables/service"
import redeemablesOrderPlacedHandler from "../../src/subscribers/redeemables-order-placed"

jest.setTimeout(120 * 1000)

// Deterministic offline mock mode; PAYOUT_MIN low so escrow amounts flow.
process.env.PAYSTACK_SECRET_KEY = "mock"
process.env.CIRCLE_API_KEY = "mock"
process.env.CRYPTO_ENABLED = "true"
process.env.ESCROW_RETURN_WINDOW_DAYS = "3"
process.env.ESCROW_FALLBACK_RELEASE_DAYS = "30"
process.env.PAYOUT_MIN_NGN = "1"
process.env.PAYOUT_SCHEDULE_ENABLED = "false"

const DAY_MS = 24 * 60 * 60 * 1000

/**
 * In-app: the whole redeemables surface — public storefront, instrument
 * minting (free + priced templates), both redemption doors, cart apply,
 * the checkout consume/undo seam and the order.placed minting subscriber.
 */
medusaIntegrationTestRunner({
  inApp: true,
  env: {},
  testSuite: ({ api, getContainer, dbUtils }) => {
    describe("Redeemables — storefront, instruments & redemption", () => {
      let redeemables: RedeemablesModuleService
      let marketplace: MarketplaceModuleService
      let token: string
      let sellerId: string
      let productId: string
      let storeHeaders: { headers: Record<string, string> }

      const auth = () => ({ headers: { Authorization: `Bearer ${token}` } })

      // POST /sellers/redeemables shorthand
      const mint = (body: Record<string, unknown>) =>
        api.post("/sellers/redeemables", body, auth())

      const seedCart = async (opts: {
        product_id: string
        unit_price?: number
      }) => {
        const cartModule = getContainer().resolve(Modules.CART)
        return await cartModule.createCarts({
          currency_code: "ngn",
          email: "buyer@howsu.local",
          items: [
            {
              title: "Cart item",
              quantity: 1,
              unit_price: opts.unit_price ?? 10000,
              product_id: opts.product_id,
            },
          ],
        })
      }

      beforeAll(async () => {
        const container = getContainer()
        marketplace = container.resolve(MARKETPLACE_MODULE)
        redeemables = container.resolve(REDEEMABLES_MODULE)

        const register = await api.post("/auth/seller/emailpass/register", {
          email: "redeemables-seller@howsu.local",
          password: "supersecret",
        })
        const created = await api.post(
          "/sellers",
          {
            name: "Redeemables Seller",
            handle: "redeemables-seller",
            admin: {
              email: "redeemables-seller@howsu.local",
              first_name: "Redeem",
              last_name: "Seller",
            },
          },
          { headers: { Authorization: `Bearer ${register.data.token}` } }
        )
        sellerId = created.data.seller.id

        const login = await api.post("/auth/seller/emailpass", {
          email: "redeemables-seller@howsu.local",
          password: "supersecret",
        })
        token = login.data.token

        // store routes demand a publishable key — mint one directly
        const apiKeyModule = container.resolve(Modules.API_KEY)
        const [pubKey] = await apiKeyModule.createApiKeys([
          {
            title: "redeemables-spec",
            type: "publishable",
            created_by: "redeemables-spec",
          },
        ])
        storeHeaders = { headers: { "x-publishable-api-key": pubKey.token } }

        // one published product owned by the seller — the storefront and
        // cart-apply tests hang off it
        const productModule = container.resolve(Modules.PRODUCT)
        const [product] = await productModule.createProducts([
          { title: "Ankara Shirt", status: "published" },
        ])
        productId = product.id
        const link = container.resolve(ContainerRegistrationKeys.LINK)
        await link.create([
          {
            [MARKETPLACE_MODULE]: { seller_id: sellerId },
            [Modules.PRODUCT]: { product_id: productId },
          },
        ])

        // the runner restores the DB from a template before every test —
        // snapshot so the onboarded seller + key survive into each one
        await dbUtils.snapshot()
      })

      it("storefront resolves a handle to profile, products and for-sale instruments (codes stripped)", async () => {
        const template = await mint({
          type: "voucher",
          title: "20% Off Everything",
          discount_type: "percent",
          discount_value: 20,
          price: 500,
        })
        expect(template.status).toEqual(201)
        expect(template.data.product_id).toBeTruthy()

        const res = await api.get(
          "/store/sellers/redeemables-seller",
          storeHeaders
        )
        expect(res.status).toEqual(200)
        expect(res.data.seller).toMatchObject({
          name: "Redeemables Seller",
          handle: "redeemables-seller",
          verification_status: "unverified",
        })
        const titles = res.data.products.map((p: { title: string }) => p.title)
        expect(titles).toContain("Ankara Shirt")

        const [forSale] = res.data.redeemables
        expect(Number(forSale.price)).toEqual(500)
        expect(forSale.code).toBeUndefined()
        expect(forSale.seller_id).toBeUndefined()

        await expect(
          api.get("/store/sellers/no-such-store", storeHeaders)
        ).rejects.toMatchObject({ response: { status: 404 } })
      })

      it("free-issues a batch of distinct prefixed codes", async () => {
        const vouchers = await mint({
          type: "voucher",
          title: "₦1000 Off",
          discount_type: "fixed",
          discount_value: 1000,
          quantity: 3,
        })
        expect(vouchers.status).toEqual(201)
        const codes = vouchers.data.redeemables.map(
          (r: { code: string }) => r.code
        )
        expect(codes).toHaveLength(3)
        expect(new Set(codes).size).toEqual(3)
        codes.forEach((c: string) => expect(c).toMatch(/^VC-/))

        const card = await mint({
          type: "gift_card",
          title: "Gift Card",
          face_value: 5000,
        })
        expect(card.data.redeemables[0].code).toMatch(/^GC-/)
        expect(Number(card.data.redeemables[0].balance)).toEqual(5000)

        const ticket = await mint({
          type: "ticket",
          title: "Owambe Ticket",
          face_value: 2000,
        })
        expect(ticket.data.redeemables[0].code).toMatch(/^TK-/)
      })

      it("rejects bad create payloads per type", async () => {
        await expect(
          mint({ type: "voucher", title: "No discount" })
        ).rejects.toMatchObject({ response: { status: 400 } })

        await expect(
          mint({ type: "gift_card", title: "No value" })
        ).rejects.toMatchObject({ response: { status: 400 } })

        await expect(
          mint({
            type: "voucher",
            title: "150% Off",
            discount_type: "percent",
            discount_value: 150,
          })
        ).rejects.toMatchObject({ response: { status: 400 } })

        await expect(
          mint({
            type: "gift_card",
            title: "Priced batch",
            face_value: 1000,
            price: 1000,
            quantity: 2,
          })
        ).rejects.toMatchObject({ response: { status: 400 } })
      })

      it("publicly checks a code and hides what it must", async () => {
        const card = await mint({
          type: "gift_card",
          title: "Check Me",
          face_value: 3000,
        })
        const code = card.data.redeemables[0].code

        const res = await api.get(`/store/redeemables/${code}`, storeHeaders)
        expect(res.status).toEqual(200)
        expect(res.data.redeemable.qr_payload).toEqual(code)
        expect(res.data.redeemable.store).toMatchObject({
          handle: "redeemables-seller",
        })
        expect(res.data.redeemable.seller_id).toBeUndefined()

        await expect(
          api.get("/store/redeemables/GC-NOPE-NOPE-NOPE", storeHeaders)
        ).rejects.toMatchObject({ response: { status: 404 } })
      })

      it("draws a gift card down across two in-store redemptions to zero", async () => {
        const card = await mint({
          type: "gift_card",
          title: "Drawdown Card",
          face_value: 10000,
        })
        const code = card.data.redeemables[0].code

        const first = await api.post(
          "/sellers/redeemables/redeem",
          { code, amount: 4000 },
          auth()
        )
        expect(first.status).toEqual(200)
        expect(first.data.redeemable.status).toEqual("active")
        expect(Number(first.data.redeemable.balance)).toEqual(6000)
        expect(Number(first.data.redemption.amount_applied)).toEqual(4000)
        expect(first.data.redemption.channel).toEqual("in_store")

        const second = await api.post(
          "/sellers/redeemables/redeem",
          { code, amount: 6000 },
          auth()
        )
        expect(second.data.redeemable.status).toEqual("redeemed")
        expect(Number(second.data.redeemable.balance)).toEqual(0)

        await expect(
          api.post("/sellers/redeemables/redeem", { code, amount: 1 }, auth())
        ).rejects.toMatchObject({
          response: {
            status: 400,
            data: { message: expect.stringContaining("already redeemed") },
          },
        })

        const other = await mint({
          type: "gift_card",
          title: "Overdraw Card",
          face_value: 10000,
        })
        const otherCode = other.data.redeemables[0].code
        await expect(
          api.post(
            "/sellers/redeemables/redeem",
            { code: otherCode, amount: 12000 },
            auth()
          )
        ).rejects.toMatchObject({
          response: {
            status: 400,
            data: { message: expect.stringContaining("left") },
          },
        })
        await expect(
          api.post("/sellers/redeemables/redeem", { code: otherCode }, auth())
        ).rejects.toMatchObject({ response: { status: 400 } })
      })

      it("kills a voucher on first use and a ticket at the door", async () => {
        const voucher = await mint({
          type: "voucher",
          title: "₦1500 Off",
          discount_type: "fixed",
          discount_value: 1500,
        })
        const vCode = voucher.data.redeemables[0].code
        const vRes = await api.post(
          "/sellers/redeemables/redeem",
          { code: vCode },
          auth()
        )
        expect(Number(vRes.data.redemption.amount_applied)).toEqual(1500)
        expect(vRes.data.redeemable.status).toEqual("redeemed")
        await expect(
          api.post("/sellers/redeemables/redeem", { code: vCode }, auth())
        ).rejects.toMatchObject({ response: { status: 400 } })

        const ticket = await mint({
          type: "ticket",
          title: "Door Ticket",
          face_value: 2000,
        })
        const tCode = ticket.data.redeemables[0].code
        const tRes = await api.post(
          "/sellers/redeemables/redeem",
          { code: tCode },
          auth()
        )
        expect(Number(tRes.data.redemption.amount_applied)).toEqual(2000)
        expect(tRes.data.redeemable.status).toEqual("redeemed")
        await expect(
          api.post("/sellers/redeemables/redeem", { code: tCode }, auth())
        ).rejects.toMatchObject({ response: { status: 400 } })
      })

      it("hides foreign codes from other sellers", async () => {
        const card = await mint({
          type: "gift_card",
          title: "Mine Only",
          face_value: 5000,
        })
        const code = card.data.redeemables[0].code
        const id = card.data.redeemables[0].id

        const register = await api.post("/auth/seller/emailpass/register", {
          email: "redeemables-intruder@howsu.local",
          password: "supersecret",
        })
        await api.post(
          "/sellers",
          {
            name: "Intruder",
            handle: "redeemables-intruder",
            admin: {
              email: "redeemables-intruder@howsu.local",
              first_name: "In",
              last_name: "Truder",
            },
          },
          { headers: { Authorization: `Bearer ${register.data.token}` } }
        )
        const login = await api.post("/auth/seller/emailpass", {
          email: "redeemables-intruder@howsu.local",
          password: "supersecret",
        })
        const intruderAuth = {
          headers: { Authorization: `Bearer ${login.data.token}` },
        }

        await expect(
          api.post(
            "/sellers/redeemables/redeem",
            { code, amount: 1000 },
            intruderAuth
          )
        ).rejects.toMatchObject({ response: { status: 404 } })

        await expect(
          api.post(`/sellers/redeemables/${id}/cancel`, {}, intruderAuth)
        ).rejects.toMatchObject({ response: { status: 404 } })
      })

      it("blocks expired codes lazily", async () => {
        const [expired] = await redeemables.mintRedeemables({
          seller_id: sellerId,
          type: "gift_card",
          title: "Expired Card",
          face_value: 5000,
          expires_at: new Date(Date.now() - DAY_MS),
        })

        await expect(
          api.post(
            "/sellers/redeemables/redeem",
            { code: expired.code, amount: 1000 },
            auth()
          )
        ).rejects.toMatchObject({
          response: {
            status: 400,
            data: { message: expect.stringContaining("expired") },
          },
        })

        const [row] = await redeemables.listRedeemables({ id: expired.id })
        expect(row.status).toEqual("expired")
      })

      it("cancels an active code and keeps it dead", async () => {
        const voucher = await mint({
          type: "voucher",
          title: "Cancel Me",
          discount_type: "fixed",
          discount_value: 500,
        })
        const { id, code } = voucher.data.redeemables[0]

        const res = await api.post(
          `/sellers/redeemables/${id}/cancel`,
          {},
          auth()
        )
        expect(res.data.redeemable.status).toEqual("cancelled")

        await expect(
          api.post("/sellers/redeemables/redeem", { code }, auth())
        ).rejects.toMatchObject({ response: { status: 400 } })

        await expect(
          api.post(`/sellers/redeemables/${id}/cancel`, {}, auth())
        ).rejects.toMatchObject({ response: { status: 400 } })
      })

      it("applies a code to a cart as adjustments + metadata", async () => {
        const card = await mint({
          type: "gift_card",
          title: "Cart Card",
          face_value: 6000,
        })
        const code = card.data.redeemables[0].code

        const cart = await seedCart({ product_id: productId })
        const res = await api.post(
          `/store/carts/${cart.id}/apply-redeemable`,
          { code },
          storeHeaders
        )
        expect(res.status).toEqual(200)
        expect(res.data.amount_applied).toEqual(6000)

        const query = getContainer().resolve(ContainerRegistrationKeys.QUERY)
        const { data: [updated] } = await query.graph({
          entity: "cart",
          fields: ["id", "metadata", "items.adjustments.*"],
          filters: { id: cart.id },
        })
        expect(updated.metadata?.redeemable_code).toEqual(code)
        expect(Number(updated.metadata?.redeemable_base_total)).toEqual(10000)
        const [adjustment] = updated.items?.[0]?.adjustments ?? []
        expect(Number(adjustment?.amount)).toEqual(6000)
        expect(adjustment?.code).toEqual(code)

        // tickets never apply at checkout — venue only
        const ticket = await mint({
          type: "ticket",
          title: "No Cart Ticket",
          face_value: 2000,
        })
        const freshCart = await seedCart({ product_id: productId })
        await expect(
          api.post(
            `/store/carts/${freshCart.id}/apply-redeemable`,
            { code: ticket.data.redeemables[0].code },
            storeHeaders
          )
        ).rejects.toMatchObject({
          response: {
            status: 400,
            data: { message: expect.stringContaining("venue") },
          },
        })
      })

      it("keeps codes store-scoped at apply time", async () => {
        const voucher = await mint({
          type: "voucher",
          title: "Scoped Voucher",
          discount_type: "fixed",
          discount_value: 1000,
        })
        const code = voucher.data.redeemables[0].code

        // another store's product in the cart → the code must refuse
        const container = getContainer()
        const otherSeller = await marketplace.createSellers({
          name: "Other Store",
          handle: "redeemables-other-store",
        })
        const productModule = container.resolve(Modules.PRODUCT)
        const [foreignProduct] = await productModule.createProducts([
          { title: "Foreign Cap", status: "published" },
        ])
        const link = container.resolve(ContainerRegistrationKeys.LINK)
        await link.create([
          {
            [MARKETPLACE_MODULE]: { seller_id: otherSeller.id },
            [Modules.PRODUCT]: { product_id: foreignProduct.id },
          },
        ])

        const cart = await seedCart({ product_id: foreignProduct.id })
        await expect(
          api.post(
            `/store/carts/${cart.id}/apply-redeemable`,
            { code },
            storeHeaders
          )
        ).rejects.toMatchObject({
          response: {
            status: 400,
            data: { message: expect.stringContaining("issuing store") },
          },
        })
      })

      it("consumes and restores value at the checkout seam", async () => {
        // percent voucher: consume → undo → consume again
        const [voucher] = await redeemables.mintRedeemables({
          seller_id: sellerId,
          type: "voucher",
          title: "Seam Voucher",
          discount_type: "percent",
          discount_value: 20,
        })
        const consumed = await redeemables.consumeAtCheckout(voucher.code, {
          order_total: 10000,
        })
        expect(consumed.amount_applied).toEqual(2000)
        expect(consumed.redeemable.status).toEqual("redeemed")
        expect(consumed.redemption.channel).toEqual("checkout")

        await redeemables.undoCheckoutConsumption(consumed.redemption.id)
        const [restored] = await redeemables.listRedeemables({
          id: voucher.id,
        })
        expect(restored.status).toEqual("active")
        const orphans = await redeemables.listRedemptions({
          id: consumed.redemption.id,
        })
        expect(orphans).toHaveLength(0)

        // gift card partially covers a smaller total
        const [card] = await redeemables.mintRedeemables({
          seller_id: sellerId,
          type: "gift_card",
          title: "Seam Card",
          face_value: 8000,
        })
        const partial = await redeemables.consumeAtCheckout(card.code, {
          order_total: 5000,
        })
        expect(partial.amount_applied).toEqual(5000)
        expect(Number(partial.redeemable.balance)).toEqual(3000)
        expect(partial.redeemable.status).toEqual("active")

        // dead codes never consume
        const [dead] = await redeemables.mintRedeemables({
          seller_id: sellerId,
          type: "voucher",
          title: "Dead Voucher",
          discount_type: "fixed",
          discount_value: 500,
        })
        await redeemables.cancelRedeemable(dead.id, sellerId)
        await expect(
          redeemables.consumeAtCheckout(dead.code, { order_total: 10000 })
        ).rejects.toThrow(/cancelled/)
      })

      it("mints sold instruments and releases redeemable-only escrow on order.placed", async () => {
        const template = await mint({
          type: "ticket",
          title: "Concert Ticket",
          face_value: 3000,
          price: 3000,
        })
        const templateRow = template.data.redeemables[0]
        const soldProductId = template.data.product_id

        const container = getContainer()
        const orderModule = container.resolve(Modules.ORDER)
        const order = await orderModule.createOrders({
          currency_code: "ngn",
          email: "buyer2@howsu.local",
          items: [
            {
              title: "Concert Ticket",
              product_id: soldProductId,
              quantity: 2,
              unit_price: 3000,
            },
          ],
        })
        const link = container.resolve(ContainerRegistrationKeys.LINK)
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
          order_total: 6000,
          rate: 0.05,
          commission_amount: 300,
          net_amount: 5700,
          seller_id: sellerId,
        })

        await redeemablesOrderPlacedHandler({
          event: { data: { id: order.id }, name: "order.placed" },
          container,
        } as never)

        const minted = await redeemables.listRedeemables({
          source_order_id: order.id,
        })
        expect(minted).toHaveLength(2)
        for (const instrument of minted) {
          expect(instrument.code).toMatch(/^TK-/)
          expect(instrument.code).not.toEqual(templateRow.code)
          expect(instrument.issued_to_email).toEqual("buyer2@howsu.local")
          expect(instrument.status).toEqual("active")
        }

        // redeemable-only order → escrow released instantly
        const [line] = await marketplace.listCommissionLines({
          order_id: order.id,
        })
        expect(line.status).toEqual("available")

        // replayed event mints nothing new
        await redeemablesOrderPlacedHandler({
          event: { data: { id: order.id }, name: "order.placed" },
          container,
        } as never)
        const afterReplay = await redeemables.listRedeemables({
          source_order_id: order.id,
        })
        expect(afterReplay).toHaveLength(2)
      })

      it("keeps mixed orders in normal escrow", async () => {
        const template = await mint({
          type: "gift_card",
          title: "Mixed Card",
          face_value: 5000,
          price: 5000,
        })
        const soldProductId = template.data.product_id

        const container = getContainer()
        const orderModule = container.resolve(Modules.ORDER)
        const order = await orderModule.createOrders({
          currency_code: "ngn",
          email: "buyer3@howsu.local",
          items: [
            {
              title: "Mixed Card",
              product_id: soldProductId,
              quantity: 1,
              unit_price: 5000,
            },
            {
              title: "Ankara Shirt",
              product_id: productId,
              quantity: 1,
              unit_price: 10000,
            },
          ],
        })
        const link = container.resolve(ContainerRegistrationKeys.LINK)
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
          order_total: 15000,
          rate: 0.05,
          commission_amount: 750,
          net_amount: 14250,
          seller_id: sellerId,
        })

        await redeemablesOrderPlacedHandler({
          event: { data: { id: order.id }, name: "order.placed" },
          container,
        } as never)

        // the sold card still mints…
        const minted = await redeemables.listRedeemables({
          source_order_id: order.id,
        })
        expect(minted).toHaveLength(1)

        // …but the physical item keeps the line in the normal window
        const [line] = await marketplace.listCommissionLines({
          order_id: order.id,
        })
        expect(line.status).toEqual("pending")
      })

      it("keeps /health 200 (no regression)", async () => {
        const res = await api.get("/health")
        expect(res.status).toEqual(200)
      })
    })
  },
})

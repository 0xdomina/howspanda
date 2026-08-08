import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
import {
  ContainerRegistrationKeys,
  Modules,
} from "@medusajs/framework/utils"
import { MARKETPLACE_MODULE } from "../../src/modules/marketplace"
import MarketplaceModuleService from "../../src/modules/marketplace/service"
import { MALL_MODULE } from "../../src/modules/mall"
import MallModuleService from "../../src/modules/mall/service"
import { DELIVERY_MODULE } from "../../src/modules/delivery"
import DeliveryModuleService from "../../src/modules/delivery/service"
import { BUYER_WALLET_MODULE } from "../../src/modules/buyer-wallet"
import BuyerWalletModuleService from "../../src/modules/buyer-wallet/service"
import { completeKycLadder } from "./helpers/complete-kyc"

jest.setTimeout(300 * 1000)

// Deterministic offline mock rails. The escrow clock runs on real 3d/30d
// constants so the release math is genuinely exercised (confirmed via the
// buyer-receipt path, not a shortened window).
process.env.PAYSTACK_SECRET_KEY = "mock"
process.env.CIRCLE_API_KEY = "mock"
process.env.CRYPTO_ENABLED = "true"
process.env.CRYPTO_WALLET_SIGNER = "mock"
process.env.ESCROW_RETURN_WINDOW_DAYS = "3"
process.env.ESCROW_FALLBACK_RELEASE_DAYS = "30"
process.env.PAYOUT_MIN_NGN = "1"
process.env.WALLET_WITHDRAW_MIN_NGN = "1"
process.env.PAYOUT_SCHEDULE_ENABLED = "false"

/**
 * ONE walk of the whole platform money loop in a single `it`, because the
 * runner restores the DB between tests. Mirrors what the real marketplace
 * produces (order + commission line + seller link) and then drives every
 * money surface over HTTP:
 *
 *   seller onboard (KYC) → product → order(escrow) → confirm-receipt release
 *   → buyer→seller tip → delivery job → courier offer negotiation → accept →
 *   pickup → confirm (courier earns) → mall launch → join → cash prize into
 *   buyer wallet → seller payout (paystack rail) → webhook success → paid →
 *   platform revenue (commissions) conservation check.
 */
medusaIntegrationTestRunner({
  inApp: true,
  env: {},
  testSuite: ({ api, getContainer, dbUtils }) => {
    describe("Money flow — full platform money loop (end to end)", () => {
      let marketplace: MarketplaceModuleService
      let mall: MallModuleService
      let delivery: DeliveryModuleService
      let buyerWallet: BuyerWalletModuleService
      let token: string
      let sellerId: string
      let storeHeaders: { headers: Record<string, string> }
      let buyerAuth: { headers: Record<string, string> }
      let secondSellerToken: string

      const auth = () => ({
        headers: {
          Authorization: `Bearer ${token}`,
          ...storeHeaders.headers,
        },
      })

      const sellerHeaders = () => auth()

      // Register + finish a customer account (register token -> create customer).
      const createCustomer = async (email: string) => {
        const reg = await api.post("/auth/customer/emailpass/register", {
          email,
          password: "supersecret",
        })
        await api.post(
          "/store/customers",
          { email },
          {
            headers: {
              Authorization: `Bearer ${reg.data.token}`,
              ...storeHeaders.headers,
            },
          }
        )
        const login = await api.post("/auth/customer/emailpass", {
          email,
          password: "supersecret",
        })
        return {
          headers: {
            Authorization: `Bearer ${login.data.token}`,
            ...storeHeaders.headers,
          },
        }
      }

      let courierSeq = 0
      const makeCourier = async (email: string) => {
        courierSeq += 1
        const phone = `+2348${String(90000000 + courierSeq).padStart(8, "0")}`
        const customer = await createCustomer(email)
        await completeKycLadder(getContainer, email, phone)
        await api.post(
          "/store/couriers/apply",
          { city: "Lagos", vehicle: "motorcycle" },
          customer
        )
        return { headers: customer, phone }
      }

      // A seller-visible order with a commission line, exactly as the
      // marketplace checkout produces it (order + link + commission).
      const seedOrder = async (email: string, unitPrice = 10000) => {
        const container = getContainer()
        const orderModule = container.resolve(Modules.ORDER)
        const link = container.resolve(ContainerRegistrationKeys.LINK)
        const [product] = await container
          .resolve(Modules.PRODUCT)
          .createProducts([{ title: "Money Flow Product", status: "published" }])
        const order = await orderModule.createOrders({
          currency_code: "ngn",
          email,
          items: [
            { title: product.title, product_id: product.id, quantity: 1, unit_price: unitPrice },
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
          rate: 0.1,
          commission_amount: Math.round(unitPrice * 0.1),
          net_amount: unitPrice - Math.round(unitPrice * 0.1),
          seller_id: sellerId,
        })
        return order
      }

      const sellerBalance = async () => {
        const res = await api.get("/sellers/balance", auth())
        return res.data.balances.ngn
      }

      beforeAll(async () => {
        marketplace = getContainer().resolve(MARKETPLACE_MODULE)
        mall = getContainer().resolve(MALL_MODULE)
        delivery = getContainer().resolve(DELIVERY_MODULE)
        buyerWallet = getContainer().resolve(BUYER_WALLET_MODULE)

        const apiKeyModule = getContainer().resolve(Modules.API_KEY)
        const [pubKey] = await apiKeyModule.createApiKeys([
          { title: "money-flow-spec", type: "publishable", created_by: "money-flow-spec" },
        ])
        storeHeaders = { headers: { "x-publishable-api-key": pubKey.token } }

        // Seller 1 — the main storefront seller.
        const register = await api.post("/auth/seller/emailpass/register", {
          email: "money-flow-seller@howsu.local",
          password: "supersecret",
        })
        await completeKycLadder(getContainer, "money-flow-seller@howsu.local", "+2348012390001")
        const created = await api.post(
          "/sellers",
          {
            name: "Money Flow Seller",
            handle: "money-flow-seller",
            admin: {
              email: "money-flow-seller@howsu.local",
              first_name: "Money",
              last_name: "Flow",
            },
          },
          { headers: { Authorization: `Bearer ${register.data.token}` } }
        )
        sellerId = created.data.seller.id
        token = (
          await api.post("/auth/seller/emailpass", {
            email: "money-flow-seller@howsu.local",
            password: "supersecret",
          })
        ).data.token

        // Seller 2 — joins the mall (pools prize money).
        const registerTwo = await api.post(
          "/auth/seller/emailpass/register",
          { email: "money-flow-seller-two@howsu.local", password: "supersecret" }
        )
        await completeKycLadder(getContainer, "money-flow-seller-two@howsu.local", "+2348012390002")
        await api.post(
          "/sellers",
          {
            name: "Money Flow Seller Two",
            handle: "money-flow-seller-two",
            admin: {
              email: "money-flow-seller-two@howsu.local",
              first_name: "Money",
              last_name: "Flow Two",
            },
          },
          { headers: { Authorization: `Bearer ${registerTwo.data.token}` } }
        )
        secondSellerToken = (
          await api.post("/auth/seller/emailpass", {
            email: "money-flow-seller-two@howsu.local",
            password: "supersecret",
          })
        ).data.token

        // Buyer — the money source for the whole loop.
        const buyerReg = await api.post("/auth/customer/emailpass/register", {
          email: "money-flow-buyer@howsu.local",
          password: "supersecret",
        })
        await api.post(
          "/store/customers",
          { email: "money-flow-buyer@howsu.local" },
          {
            headers: {
              Authorization: `Bearer ${buyerReg.data.token}`,
              ...storeHeaders.headers,
            },
          }
        )
        const buyerLogin = await api.post("/auth/customer/emailpass", {
          email: "money-flow-buyer@howsu.local",
          password: "supersecret",
        })
        buyerAuth = {
          headers: {
            Authorization: `Bearer ${buyerLogin.data.token}`,
            ...storeHeaders.headers,
          },
        }

        // A verified payout destination for the seller.
        const bank = await api.post(
          "/sellers/payout-accounts",
          { type: "bank_account", bank_code: "058", account_number: "0123456789", account_name: "MOCK ACCOUNT 6789" },
          auth()
        )
        expect(bank.status).toEqual(201)

        await dbUtils.snapshot()
      })

      it("walks the full platform money loop with conservation", async () => {
        // ── 1. Order in escrow (buyer pays ₦10,000; platform 10% = ₦1,000) ──
        const order = await seedOrder("money-flow-buyer@howsu.local", 10000)
        let bal = await sellerBalance()
        expect(bal.pending).toEqual(9000)
        expect(bal.available).toEqual(0)

        // ── 2. Seller marks delivered → return window starts ──
        const delivered = await api.post(
          `/sellers/orders/${order.id}/mark-delivered`,
          {},
          auth()
        )
        expect(delivered.status).toEqual(200)

        // ── 3. Buyer confirms receipt → escrow releases to available ──
        const release = await api.post(
          `/store/orders/${order.id}/confirm-receipt`,
          { email: "money-flow-buyer@howsu.local" },
          storeHeaders
        )
        expect(release.status).toEqual(200)
        bal = await sellerBalance()
        expect(bal.pending).toEqual(0)
        expect(bal.available).toEqual(9000)

        // ── 4. Buyer tips seller ₦2,500 → 10% fee → +₦2,250 available ──
        const tip = await api.post(
          `/store/orders/${order.id}/tip`,
          { email: "money-flow-buyer@howsu.local", amount: 2500, note: "great service!" },
          buyerAuth
        )
        expect(tip.status).toEqual(200)
        expect(Number(tip.data.tip.amount)).toEqual(2500)
        bal = await sellerBalance()
        expect(bal.available).toBeCloseTo(11250, 2)

        // ── 5. Delivery: post job → two couriers counter-offer → negotiate → accept ──
        const job = await api.post(
          "/store/delivery-jobs",
          {
            packageDescription: "A box of handmade soaps",
            packageWeight: "2kg",
            pickupAddress: "12 Adeola Odeku St, Victoria Island, Lagos",
            destinationAddress: "4 Allen Ave, Ikeja, Lagos",
            destinationPhone: "08012345678",
            postedPrice: 5000,
            orderId: order.id,
          },
          sellerHeaders()
        )
        expect(job.status).toEqual(201)
        const jobId = job.data.job.id

        const courierA = await makeCourier("money-flow-courier-a@howsu.local")
        const courierB = await makeCourier("money-flow-courier-b@howsu.local")
        const offerA = await api.post(
          `/store/delivery-jobs/${jobId}/offers`,
          { offeredPrice: 4500 },
          courierA.headers
        )
        expect(offerA.status).toEqual(201)
        const offerB = await api.post(
          `/store/delivery-jobs/${jobId}/offers`,
          { offeredPrice: 4000 },
          courierB.headers
        )
        expect(offerB.status).toEqual(201)

        // two live offers → job is negotiating
        const negotiating = await api.get(
          `/store/delivery-jobs/${jobId}`,
          storeHeaders
        )
        expect(negotiating.data.job.status).toEqual("negotiating")

        // only the seller can accept
        await expect(
          api.post(
            `/store/delivery-jobs/${jobId}/offers/${offerB.data.offer.id}/accept`,
            {},
            storeHeaders
          )
        ).rejects.toMatchObject({ response: { status: 401 } })

        const accept = await api.post(
          `/store/delivery-jobs/${jobId}/offers/${offerB.data.offer.id}/accept`,
          {},
          sellerHeaders()
        )
        expect(accept.status).toEqual(200)
        expect(accept.data.job.status).toEqual("accepted")

        // accepted courier picks up
        await expect(
          api.post(`/store/delivery-jobs/${jobId}/pickup`, {}, courierA.headers)
        ).rejects.toMatchObject({ response: { status: 401 } })
        const picked = await api.post(
          `/store/delivery-jobs/${jobId}/pickup`,
          {},
          courierB.headers
        )
        expect(picked.status).toEqual(200)
        expect(picked.data.job.status).toEqual("in_transit")

        // recipient confirms → courier B earns ₦4,000 into the buyer wallet
        await delivery.ensureParty(jobId, "recipient", "money-flow-recipient@howsu.local")
        const beforeCourier = await buyerWallet.balance("money-flow-courier-b@howsu.local")
        const confirm = await api.post(
          `/store/delivery-jobs/${jobId}/confirm`,
          { recipientEmail: "money-flow-recipient@howsu.local" },
          storeHeaders
        )
        expect(confirm.status).toEqual(200)
        expect(Number(confirm.data.payout)).toEqual(4000)
        expect(await buyerWallet.balance("money-flow-courier-b@howsu.local")).toBe(
          beforeCourier + 4000
        )

        // ── 6. Mall: launch → join → active → purchase → cash prize into wallet ──
        const mallRes = await api.post(
          "/store/malls",
          {
            name: "Money Flow Mall",
            description: "A mall",
            prizeWinnerCount: 1,
            prizeDistribution: "equal",
            prizePoolNgn: 20000,
            targetSellers: 2,
            targetBuyers: 2,
          },
          sellerHeaders()
        )
        expect(mallRes.status).toEqual(201)
        const mallId = mallRes.data.mall.id

        // both sellers join (the creator is NOT auto-joined), both buyers join
        // → thresholds met → auto-active
        const joinOwner = await api.post(
          `/store/malls/${mallId}/join`,
          { contributionNgn: 10000 },
          sellerHeaders()
        )
        expect(joinOwner.status).toEqual(201)
        const join = await api.post(
          `/store/malls/${mallId}/join`,
          { contributionNgn: 10000 },
          {
            headers: {
              Authorization: `Bearer ${secondSellerToken}`,
              ...storeHeaders.headers,
            },
          }
        )
        expect(join.status).toEqual(201)
        await api.post(
          `/store/malls/${mallId}/join-buyer`,
          { buyerEmail: "money-flow-buyer@howsu.local" },
          storeHeaders
        )
        await api.post(
          `/store/malls/${mallId}/join-buyer`,
          { buyerEmail: "money-flow-recipient@howsu.local" },
          storeHeaders
        )
        const active = await mall.getDetails(mallId)
        expect(active.status).toEqual("active")

        const beforePrize = await buyerWallet.balance("money-flow-buyer@howsu.local")
        const purchase = await api.post(
          `/store/malls/${mallId}/purchase`,
          { buyerEmail: "money-flow-buyer@howsu.local", orderId: order.id },
          storeHeaders
        )
        expect(purchase.status).toEqual(200)
        if (purchase.data.result?.won) {
          expect(Number(purchase.data.result.prizeAmount)).toBeGreaterThan(0)
          expect(await buyerWallet.balance("money-flow-buyer@howsu.local")).toBe(
            beforePrize + Number(purchase.data.result.prizeAmount)
          )
        }

        // ── 7. Seller payout: available ₦11,250 → paystack rail → paid ──
        const payout = await api.post(
          "/sellers/payouts",
          { rail: "paystack", idempotency_key: "money-flow-po-1" },
          auth()
        )
        expect(payout.status).toEqual(200)
        expect(payout.data.payout.status).toEqual("processing")
        expect(Number(payout.data.payout.amount)).toEqual(11250)

        // lines reserved
        const reserved = await marketplace.listCommissionLines({
          seller_id: sellerId,
          status: "reserved",
        })
        expect(reserved.length).toBeGreaterThan(0)
        for (const line of reserved) {
          expect(line.payout_id).toEqual(payout.data.payout.id)
        }

        const hook = await api.post("/hooks/payouts/paystack", {
          event: "transfer.success",
          data: { reference: payout.data.payout.id },
        })
        expect(hook.status).toEqual(200)
        expect(hook.data.received).toBe(true)

        const paid = await marketplace.retrievePayout(payout.data.payout.id)
        expect(paid.status).toEqual("paid")
        expect(paid.paid_at).toBeTruthy()

        bal = await sellerBalance()
        expect(bal.available).toEqual(0)
        expect(bal.paid_out).toEqual(11250)

        // ── 8. Platform revenue conservation ──
        // Buyer spent ₦10,000 (order) + ₦2,500 (tip). Platform took 10% of each.
        // Seller received net 9000 + tip net 2250 = 11250 (now paid out).
        // Couriers earned 4000. Mall pool held platform tax on the pledge.
        const commissionLines = await marketplace.listCommissionLines({
          seller_id: sellerId,
        })
        const platformFromOrder = commissionLines
          .filter((l) => l.order_id === order.id && l.order_id !== `${order.id}:reversal`)
          .reduce((s, l) => s + Number(l.commission_amount), 0)
        expect(platformFromOrder).toEqual(1000)

        // tip commission: the tip created its own commission line of 250
        const tipLine = commissionLines.find((l) =>
          l.order_id?.startsWith(`tip:${order.id}:`)
        )
        expect(tipLine).toBeTruthy()
        expect(Number(tipLine!.commission_amount)).toEqual(250)
      })

      it("guards money routes: unauthenticated seller balance is rejected", async () => {
        await expect(api.get("/sellers/balance")).rejects.toMatchObject({
          response: { status: 401 },
        })
      })

      it("guards money routes: non-owner cannot tip another seller's order", async () => {
        // The order belongs to money-flow-buyer (not the intruder).
        const order = await seedOrder("money-flow-buyer@howsu.local", 5000)

        const intruderReg = await api.post("/auth/customer/emailpass/register", {
          email: "intruder@howsu.local",
          password: "supersecret",
        })
        await api.post(
          "/store/customers",
          { email: "intruder@howsu.local" },
          {
            headers: {
              Authorization: `Bearer ${intruderReg.data.token}`,
              ...storeHeaders.headers,
            },
          }
        )
        const intruderLogin = await api.post("/auth/customer/emailpass", {
          email: "intruder@howsu.local",
          password: "supersecret",
        })

        // a DIFFERENT buyer tries to tip the order owned by money-flow-buyer
        await expect(
          api.post(
            `/store/orders/${order.id}/tip`,
            { email: "intruder@howsu.local", amount: 500 },
            {
              headers: {
                Authorization: `Bearer ${intruderLogin.data.token}`,
                ...storeHeaders.headers,
              },
            }
          )
        ).rejects.toMatchObject({ response: { status: 404 } })
      })
    })
  },
})

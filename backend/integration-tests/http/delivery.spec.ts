import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
import { Modules } from "@medusajs/framework/utils"
import { DELIVERY_MODULE } from "../../src/modules/delivery"
import DeliveryModuleService from "../../src/modules/delivery/service"
import { BUYER_WALLET_MODULE } from "../../src/modules/buyer-wallet"
import BuyerWalletModuleService from "../../src/modules/buyer-wallet/service"

jest.setTimeout(240 * 1000)

process.env.PAYSTACK_SECRET_KEY = "mock"

// The test runner snapshots the database after the suite beforeAll and
// restores it before EVERY test. So shared fixtures (sellers, publishable key)
// live in beforeAll, and any job used across steps must be created within the
// same `it` (the DB is reset between tests).

medusaIntegrationTestRunner({
  inApp: true,
  env: {},
  testSuite: ({ api, getContainer }) => {
    describe("Delivery — P2P delivery jobs (Phase 11)", () => {
      let delivery: DeliveryModuleService
      let buyerWallet: BuyerWalletModuleService
      let token: string
      let sellerId: string
      let storeHeaders: { headers: Record<string, string> }

      const sellerAuth = () => ({
        headers: {
          Authorization: `Bearer ${token}`,
          ...storeHeaders.headers,
        },
      })

      const POST_JOB_BODY = {
        packageDescription: "A box of handmade soaps",
        packageWeight: "2kg",
        pickupAddress: "12 Adeola Odeku St, Victoria Island, Lagos",
        destinationAddress: "4 Allen Ave, Ikeja, Lagos",
        destinationPhone: "08012345678",
        postedPrice: 5000,
      }

      beforeAll(async () => {
        delivery = getContainer().resolve(DELIVERY_MODULE)
        buyerWallet = getContainer().resolve(BUYER_WALLET_MODULE)

        const apiKeyModule = getContainer().resolve(Modules.API_KEY)
        const [pubKey] = await apiKeyModule.createApiKeys([
          { title: "delivery-spec", type: "publishable", created_by: "delivery-spec" },
        ])
        storeHeaders = { headers: { "x-publishable-api-key": pubKey.token } }

        const register = await api.post("/auth/seller/emailpass/register", {
          email: "delivery-seller@howsu.local",
          password: "supersecret",
        })
        const created = await api.post(
          "/sellers",
          {
            name: "Delivery Seller",
            handle: "delivery-seller",
            admin: {
              email: "delivery-seller@howsu.local",
              first_name: "Del",
              last_name: "ivery",
            },
          },
          { headers: { Authorization: `Bearer ${register.data.token}` } }
        )
        sellerId = created.data.seller.id
        const login = await api.post("/auth/seller/emailpass", {
          email: "delivery-seller@howsu.local",
          password: "supersecret",
        })
        token = login.data.token
      })

      it("posts a delivery job from a completed order", async () => {
        const res = await api.post(
          "/store/delivery-jobs",
          { ...POST_JOB_BODY, orderId: "order_delivery_1" },
          sellerAuth()
        )
        expect(res.status).toEqual(201)
        expect(res.data.job.status).toEqual("open")
        expect(res.data.job.seller_id).toEqual(sellerId)
        expect(Number(res.data.job.posted_price)).toEqual(5000)
      })

      it("rejects an unauthenticated job posting", async () => {
        await expect(
          api.post("/store/delivery-jobs", POST_JOB_BODY, storeHeaders)
        ).rejects.toMatchObject({ response: { status: 401 } })
      })

      it("browses and filters open jobs with only a publishable key", async () => {
        await api.post(
          "/store/delivery-jobs",
          { ...POST_JOB_BODY, orderId: "order_delivery_browse" },
          sellerAuth()
        )
        const res = await api.get("/store/delivery-jobs", storeHeaders)
        expect(res.status).toEqual(200)
        expect(
          res.data.jobs.filter((j) => j.status === "open").length
        ).toBeGreaterThan(0)

        const cityRes = await api.get("/store/delivery-jobs?city=ikeja", storeHeaders)
        expect(
          cityRes.data.jobs.filter(
            (j) =>
              j.destination_address.toLowerCase().includes("ikeja") ||
              j.pickup_address.toLowerCase().includes("ikeja")
          ).length
        ).toBeGreaterThan(0)
      })

      it("full flow: post → offer → accept → pickup → confirm → payout", async () => {
        const created = await api.post(
          "/store/delivery-jobs",
          { ...POST_JOB_BODY, orderId: "order_delivery_flow" },
          sellerAuth()
        )
        const jobId = created.data.job.id

        // counter-offers make the job negotiating (2 offers)
        const offerA = await api.post(
          `/store/delivery-jobs/${jobId}/offers`,
          { courierEmail: "courier-a@howsu.local", offeredPrice: 4500 },
          storeHeaders
        )
        expect(offerA.status).toEqual(201)
        expect(offerA.data.offer.status).toEqual("pending")
        const offerB = await api.post(
          `/store/delivery-jobs/${jobId}/offers`,
          { courierEmail: "courier-b@howsu.local", offeredPrice: 4000 },
          storeHeaders
        )
        expect(offerB.status).toEqual(201)

        const details = await api.get(`/store/delivery-jobs/${jobId}`, storeHeaders)
        expect(details.data.job.status).toEqual("negotiating")

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
          sellerAuth()
        )
        expect(accept.status).toEqual(200)
        expect(accept.data.job.status).toEqual("accepted")
        expect(accept.data.job.accepted_offer_id).toEqual(offerB.data.offer.id)

        // the losing offer is rejected
        const offers = await delivery.listDeliveryOffers({ job_id: jobId })
        expect(offers.filter((o) => o.status === "rejected").length).toEqual(1)

        // only the accepted courier can mark pickup
        await expect(
          api.post(
            `/store/delivery-jobs/${jobId}/pickup`,
            { courierEmail: "not-the-courier@howsu.local" },
            storeHeaders
          )
        ).rejects.toMatchObject({ response: { status: 401 } })

        const picked = await api.post(
          `/store/delivery-jobs/${jobId}/pickup`,
          { courierEmail: "courier-b@howsu.local" },
          storeHeaders
        )
        expect(picked.status).toEqual(200)
        expect(picked.data.job.status).toEqual("in_transit")

        // recipient confirms → payout released to the courier wallet
        const before = await buyerWallet.balance("courier-b@howsu.local")
        const confirm = await api.post(
          `/store/delivery-jobs/${jobId}/confirm`,
          { recipientEmail: "recipient@howsu.local" },
          storeHeaders
        )
        expect(confirm.status).toEqual(200)
        expect(confirm.data.job.status).toEqual("delivered")
        expect(Number(confirm.data.payout)).toEqual(4000)
        expect(confirm.data.courierEmail).toEqual("courier-b@howsu.local")

        const after = await buyerWallet.balance("courier-b@howsu.local")
        expect(after - before).toEqual(4000)

        const ledger = await buyerWallet.listLedger("courier-b@howsu.local")
        expect(ledger[0].source).toEqual("delivery_payout")
      })

      it("pre-pickup cancellation auto-approves and cancels the job", async () => {
        const created = await api.post(
          "/store/delivery-jobs",
          { ...POST_JOB_BODY, orderId: "order_delivery_3" },
          sellerAuth()
        )
        const id = created.data.job.id
        await api.post(
          `/store/delivery-jobs/${id}/offers`,
          { courierEmail: "courier-c@howsu.local", offeredPrice: 5000 },
          storeHeaders
        )
        const res = await api.post(
          `/store/delivery-jobs/${id}/cancel`,
          { email: "delivery-seller@howsu.local", reason: "Buyer changed their mind" },
          storeHeaders
        )
        expect(res.status).toEqual(200)
        expect(res.data.job.status).toEqual("cancelled")
        expect(res.data.requiresSenderApproval).toEqual(false)
      })

      it("courier cancel after pickup requires sender approval", async () => {
        const created = await api.post(
          "/store/delivery-jobs",
          { ...POST_JOB_BODY, orderId: "order_delivery_4" },
          sellerAuth()
        )
        const id = created.data.job.id
        const offer = await api.post(
          `/store/delivery-jobs/${id}/offers`,
          { courierEmail: "courier-d@howsu.local", offeredPrice: 5000 },
          storeHeaders
        )
        await api.post(
          `/store/delivery-jobs/${id}/offers/${offer.data.offer.id}/accept`,
          {},
          sellerAuth()
        )
        await api.post(
          `/store/delivery-jobs/${id}/pickup`,
          { courierEmail: "courier-d@howsu.local" },
          storeHeaders
        )
        const res = await api.post(
          `/store/delivery-jobs/${id}/cancel`,
          { email: "courier-d@howsu.local", reason: "Bike broke down" },
          storeHeaders
        )
        expect(res.status).toEqual(200)
        expect(res.data.job.status).toEqual("in_transit")
        expect(res.data.requiresSenderApproval).toEqual(true)
        expect(res.data.job.cancel_requires_sender_approval).toEqual(true)

        const approved = await delivery.approveCancellation(id, "delivery-seller@howsu.local")
        expect(approved.status).toEqual("cancelled")
      })

      it("counter-offers keep immutable history", async () => {
        const created = await api.post(
          "/store/delivery-jobs",
          { ...POST_JOB_BODY, orderId: "order_delivery_5" },
          sellerAuth()
        )
        const id = created.data.job.id
        const first = await api.post(
          `/store/delivery-jobs/${id}/offers`,
          { courierEmail: "courier-e@howsu.local", offeredPrice: 4800 },
          storeHeaders
        )
        const second = await api.post(
          `/store/delivery-jobs/${id}/offers`,
          { courierEmail: "courier-e@howsu.local", offeredPrice: 4600 },
          storeHeaders
        )
        expect(first.data.offer.id).not.toEqual(second.data.offer.id)

        const offers = await delivery.listDeliveryOffers({ job_id: id })
        const byCourier = offers.filter(
          (o) => o.courier_email === "courier-e@howsu.local"
        )
        expect(byCourier.length).toEqual(2)
      })
    })
  },
})

import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
import {
  Modules,
  ContainerRegistrationKeys,
} from "@medusajs/framework/utils"
import { KYC_MODULE } from "../../src/modules/kyc"
import KycModuleService from "../../src/modules/kyc/service"
import { MARKETPLACE_MODULE } from "../../src/modules/marketplace"
import type MarketplaceModuleService from "../../src/modules/marketplace/service"
import { DELIVERY_MODULE } from "../../src/modules/delivery"
import type DeliveryModuleService from "../../src/modules/delivery/service"
import { completeKycLadder } from "./helpers/complete-kyc"

jest.setTimeout(240 * 1000)

// Verification delivery is a no-op unless KYC_VERIFICATION_ENABLED=true. For
// tests we enable it and use the `mock` channel, which returns the raw code so
// the full ladder is exercised offline (like Phase 12's in-app codes).
process.env.KYC_VERIFICATION_ENABLED = "true"
process.env.KYC_VERIFICATION_CHANNEL = "mock"

// Per-test state resets: the runner restores the DB snapshot before EVERY
// test, so any verified courier/seller must be set up within the same `it`.
medusaIntegrationTestRunner({
  inApp: true,
  env: {},
  testSuite: ({ api, getContainer }) => {
    describe("KYC — progressive identity ladder (Phase 14)", () => {
      let kyc: KycModuleService
      let marketplace: MarketplaceModuleService
      let delivery: DeliveryModuleService
      let query: any
      let token: string
      let sellerAuth: () => { headers: Record<string, string> }
      let storeHeaders: { headers: Record<string, string> }

      beforeAll(async () => {
        kyc = getContainer().resolve(KYC_MODULE)
        marketplace = getContainer().resolve(MARKETPLACE_MODULE)
        delivery = getContainer().resolve(DELIVERY_MODULE)
        query = getContainer().resolve(ContainerRegistrationKeys.QUERY)

        const apiKeyModule = getContainer().resolve(Modules.API_KEY)
        const [pubKey] = await apiKeyModule.createApiKeys([
          { title: "kyc-spec", type: "publishable", created_by: "kyc-spec" },
        ])
        storeHeaders = { headers: { "x-publishable-api-key": pubKey.token } }

        const register = await api.post("/auth/seller/emailpass/register", {
          email: "kyc-seller@howsu.local",
          password: "supersecret",
        })
        await completeKycLadder(getContainer, "kyc-seller@howsu.local", "+2348012300015")
        await api.post(
          "/sellers",
          {
            name: "Kyc Seller",
            handle: "kyc-seller",
            admin: {
              email: "kyc-seller@howsu.local",
              first_name: "Ky",
              last_name: "Cee",
            },
          },
          { headers: { Authorization: `Bearer ${register.data.token}` } }
        )
        const login = await api.post("/auth/seller/emailpass", {
          email: "kyc-seller@howsu.local",
          password: "supersecret",
        })
        token = login.data.token
        sellerAuth = () => ({
          headers: {
            Authorization: `Bearer ${token}`,
            ...storeHeaders.headers,
          },
        })
      })

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

      // Seed an open delivery job straight through the delivery module: the
      // route geocodes via live Nominatim, which isn't reachable offline. The
      // KYC gate under test applies to courier offers, not job creation.
      const createJob = async (orderId: string) => {
        const job = await delivery.createDeliveryJobs({
          order_id: orderId,
          package_description: "A box of handmade soaps",
          package_weight: "2kg",
          pickup_address: "12 Adeola Odeku St, Victoria Island, Lagos",
          destination_address: "4 Allen Ave, Ikeja, Lagos",
          destination_phone: "08012345678",
          posted_price: 5000,
          status: "open",
        })
        return job.id
      }

      // Couriers are real roles: account + phone KYC + approved application.
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

      it("is wired but does NOT send when verification is disabled", async () => {
        process.env.KYC_VERIFICATION_ENABLED = "false"
        try {
          const res = await api.post("/kyc/request", {
            email: "quiet@howsu.local",
            channel: "email",
            destination: "quiet@howsu.local",
          })
          expect(res.status).toEqual(201)
          // no send seam, no code exposed
          expect(res.data.code).toBeNull()

          // still recorded for later verification once enabled
          const status = await api.get(
            `/kyc/status?email=quiet@howsu.local`
          )
          expect(status.data.profile).not.toBeNull()
          expect(status.data.profile.level).toEqual("unverified")
        } finally {
          process.env.KYC_VERIFICATION_ENABLED = "true"
        }
      })

      it("verifies a phone number with a mock code and levels up", async () => {
        const requested = await api.post("/kyc/request", {
          email: "courier-kyc@howsu.local",
          channel: "phone",
          destination: "+2348012345678",
        })
        expect(requested.status).toEqual(201)
        expect(requested.data.code).toMatch(/^\d{6}$/)

        // wrong code rejected
        await expect(
          api.post("/kyc/verify", {
            email: "courier-kyc@howsu.local",
            channel: "phone",
            destination: "+2348012345678",
            code: "000000",
          })
        ).rejects.toMatchObject({ response: { status: 400 } })

        // right code levels up to phone_verified
        const verified = await api.post("/kyc/verify", {
          email: "courier-kyc@howsu.local",
          channel: "phone",
          destination: "+2348012345678",
          code: requested.data.code,
        })
        expect(verified.data.ok).toBe(true)
        expect(verified.data.profile.level).toEqual("phone_verified")
        expect(verified.data.profile.phone_verified).toBe(true)

        // code is single-use
        await expect(
          api.post("/kyc/verify", {
            email: "courier-kyc@howsu.local",
            channel: "phone",
            destination: "+2348012345678",
            code: requested.data.code,
          })
        ).rejects.toMatchObject({ response: { status: 400 } })
      })

      it("verifies an email address", async () => {
        const requested = await api.post("/kyc/request", {
          email: "email-kyc@howsu.local",
          channel: "email",
          destination: "email-kyc@howsu.local",
        })
        expect(requested.data.code).toMatch(/^\d{6}$/)

        const verified = await api.post("/kyc/verify", {
          email: "email-kyc@howsu.local",
          channel: "email",
          destination: "email-kyc@howsu.local",
          code: requested.data.code,
        })
        expect(verified.data.ok).toBe(true)
        expect(verified.data.profile.phone_verified).toBe(false)
        expect(verified.data.profile.level).toEqual("unverified")
      })

      it("submits a NIN into the ladder (pending -> verified on review)", async () => {
        // valid-format NIN accepted as pending
        const submitted = await api.post("/kyc/identity", {
          email: "nin-kyc@howsu.local",
          id_type: "nin",
          id_number: "12345678901",
        })
        expect(submitted.status).toEqual(201)
        expect(submitted.data.profile.id_status).toEqual("pending")
        expect(submitted.data.profile.id_tail).toEqual("8901")
        expect(submitted.data.profile.level).toEqual("unverified")

        // invalid NIN rejected
        await expect(
          api.post("/kyc/identity", {
            email: "nin-bad@howsu.local",
            id_type: "nin",
            id_number: "123",
          })
        ).rejects.toMatchObject({ response: { status: 400 } })

        // review approves -> identity_verified
        const reviewed = await kyc.reviewIdentity({
          email: "nin-kyc@howsu.local",
          decision: "verified",
        })
        expect(reviewed.profile.id_status).toEqual("verified")
        expect(reviewed.profile.level).toEqual("identity_verified")
      })

      it("never exposes the full ID number", async () => {
        await api.post("/kyc/identity", {
          email: "mask-kyc@howsu.local",
          id_type: "nin",
          id_number: "99887766554",
        })
        const status = await api.get("/kyc/status?email=mask-kyc@howsu.local")
        const raw = JSON.stringify(status.data)
        expect(raw).not.toContain("99887766554")
        expect(status.data.profile.id_tail).toEqual("6554")
      })

      it("requires the profile_completed KYC level before a courier can offer", async () => {
        const jobId = await createJob("order_kyc_gate")

        // an account with no phone verification cannot offer
        const unverified = await createCustomer("unverified-kyc@howsu.local")
        await expect(
          api.post(
            `/store/delivery-jobs/${jobId}/offers`,
            { offeredPrice: 4500 },
            unverified
          )
        ).rejects.toMatchObject({
          response: { status: 400, data: { code: "kyc_required" } },
        })

        // phone-verified but no profile is still below the unlock level
        const phone = "+2348076543210"
        const phoneOnly = await createCustomer("phone-only-kyc@howsu.local")
        const requested = await api.post("/kyc/request", {
          email: "phone-only-kyc@howsu.local",
          channel: "phone",
          destination: phone,
        })
        await api.post("/kyc/verify", {
          email: "phone-only-kyc@howsu.local",
          channel: "phone",
          destination: phone,
          code: requested.data.code,
        })
        await expect(
          api.post(
            `/store/delivery-jobs/${jobId}/offers`,
            { offeredPrice: 4500 },
            phoneOnly
          )
        ).rejects.toMatchObject({
          response: { status: 400, data: { code: "kyc_required" } },
        })

        // full ladder (phone + profile) + approved courier can offer
        const courier = await makeCourier("courier-verify-kyc@howsu.local")
        const ok = await api.post(
          `/store/delivery-jobs/${jobId}/offers`,
          { offeredPrice: 4500 },
          courier.headers
        )
        expect(ok.status).toEqual(201)
        expect(ok.data.offer.courier_email).toEqual("courier-verify-kyc@howsu.local")
      })

      it("auto-activates courierhood at the profile_completed KYC level", async () => {
        const jobId = await createJob("order_kyc_auto")

        // phone KYC + profile completed, but NEVER applied to be a courier —
        // the ladder level alone is the activation, there is no approval step
        const phone = "+2348088888888"
        const customer = await createCustomer("auto-activate@howsu.local")
        const requested = await api.post("/kyc/request", {
          email: "auto-activate@howsu.local",
          channel: "phone",
          destination: phone,
        })
        await api.post("/kyc/verify", {
          email: "auto-activate@howsu.local",
          channel: "phone",
          destination: phone,
          code: requested.data.code,
        })
        // the profile step is authenticated on the user profile: filling it
        // pushes the level to profile_completed, which unlocks courierhood
        const profile = await api.post(
          "/store/kyc/profile",
          {
            first_name: "Auto",
            last_name: "Activate",
            address: "1 Test Street",
            country: "NG",
            state: "Lagos",
            city: "Ikeja",
          },
          customer
        )
        expect(profile.status).toEqual(200)
        expect(profile.data.profile.level).toEqual("profile_completed")
        expect(profile.data.profile.country).toEqual("NG")

        const ok = await api.post(
          `/store/delivery-jobs/${jobId}/offers`,
          { offeredPrice: 4500 },
          customer
        )
        expect(ok.status).toEqual(201)
        expect(ok.data.offer.courier_email).toEqual("auto-activate@howsu.local")

        // the courier dashboard reflects the auto-seeded approved profile
        const me = await api.get("/store/couriers/me", customer)
        expect(me.data.courier).not.toBeNull()
        expect(me.data.courier.status).toEqual("approved")
        expect(me.data.kyc.phone_verified).toBe(true)
      })

      it("surfaces the seller's KYC level on /sellers/me", async () => {
        // the seller completed the profile ladder in beforeAll, so the
        // profile_completed level is what the seller surface reports
        const res = await api.get("/sellers/me", sellerAuth())
        expect(res.status).toEqual(200)
        expect(res.data.kyc).not.toBeNull()
        expect(res.data.kyc.email).toEqual("kyc-seller@howsu.local")
        expect(res.data.kyc.level).toEqual("profile_completed")
        expect(res.data.kyc.phone_verified).toBe(true)
      })

      it("anchors KYC to the user profile, not just a contact string", async () => {
        // a public, email-keyed submission creates the profile first
        await api.post("/kyc/identity", {
          email: "kyc-seller@howsu.local",
          id_type: "nin",
          id_number: "12345678901",
        })

        // /sellers/me reads (and links) it to the seller_admin account
        const me = await api.get("/sellers/me", sellerAuth())
        expect(me.data.kyc.id_status).toEqual("pending")

        const [sellerAdminRow] = await query.graph({
          entity: "seller_admin",
          fields: ["id"],
          filters: { email: "kyc-seller@howsu.local" },
        }).then((r: any) => r.data)

        const profiles = await kyc.listKycProfiles({})
        const linked = profiles.find(
          (p) => p.email === "kyc-seller@howsu.local"
        )
        expect(linked?.user_type).toEqual("seller")
        expect(linked?.user_id).toEqual(sellerAdminRow.id)

        // /store/kyc/me is the user-profile KYC surface for any actor
        const actorKyc = await api.get("/store/kyc/me", sellerAuth())
        expect(actorKyc.data.kyc).not.toBeNull()
        expect(actorKyc.data.kyc.id_status).toEqual("pending")

        // customers get the same surface: verify a phone, read it back
        const phone = "+2348077777777"
        const customer = await createCustomer("profile-kyc@howsu.local")
        const requested = await api.post("/kyc/request", {
          email: "profile-kyc@howsu.local",
          channel: "phone",
          destination: phone,
        })
        await api.post("/kyc/verify", {
          email: "profile-kyc@howsu.local",
          channel: "phone",
          destination: phone,
          code: requested.data.code,
        })
        const customerKyc = await api.get("/store/kyc/me", customer)
        expect(customerKyc.data.kyc).not.toBeNull()
        expect(customerKyc.data.kyc.phone_verified).toBe(true)
      })

      it("reflects the seller's KYC identity state on the public store page", async () => {
        // fresh per-test DB: no identity submitted -> unverified
        const before = await api.get("/store/sellers/kyc-seller", storeHeaders)
        expect(before.data.seller.verification_status).toEqual("unverified")

        // submitting a NIN moves the store to pending
        const submitted = await api.post("/kyc/identity", {
          email: "kyc-seller@howsu.local",
          id_type: "nin",
          id_number: "12345678901",
        })
        expect(submitted.status).toEqual(201)
        const pending = await api.get("/store/sellers/kyc-seller", storeHeaders)
        expect(pending.data.seller.verification_status).toEqual("pending")
        // the persisted column is written too (the "never written" fix)
        const synced = await marketplace.listSellers({
          handle: "kyc-seller",
        })
        expect(synced[0].verification_status).toEqual("pending")

        // admin review approving flips the store to verified (service layer —
        // the thin-wrapper convention; admin routes need an admin JWT)
        const approved = await kyc.reviewIdentity({
          email: "kyc-seller@howsu.local",
          decision: "verified",
        })
        expect(approved.profile.id_status).toEqual("verified")
        const verified = await api.get("/store/sellers/kyc-seller", storeHeaders)
        expect(verified.data.seller.verification_status).toEqual("verified")

        // rejecting the reviewed identity sends the store back to unverified
        await kyc.reviewIdentity({
          email: "kyc-seller@howsu.local",
          decision: "rejected",
        })
        const rejected = await api.get("/store/sellers/kyc-seller", storeHeaders)
        expect(rejected.data.seller.verification_status).toEqual("unverified")
      })
    })
  },
})

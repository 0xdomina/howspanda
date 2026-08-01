import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
import { Modules } from "@medusajs/framework/utils"
import { KYC_MODULE } from "../../src/modules/kyc"
import KycModuleService from "../../src/modules/kyc/service"

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
      let token: string
      let sellerAuth: () => { headers: Record<string, string> }
      let storeHeaders: { headers: Record<string, string> }

      const POST_JOB_BODY = {
        packageDescription: "A box of handmade soaps",
        packageWeight: "2kg",
        pickupAddress: "12 Adeola Odeku St, Victoria Island, Lagos",
        destinationAddress: "4 Allen Ave, Ikeja, Lagos",
        destinationPhone: "08012345678",
        postedPrice: 5000,
      }

      beforeAll(async () => {
        kyc = getContainer().resolve(KYC_MODULE)

        const apiKeyModule = getContainer().resolve(Modules.API_KEY)
        const [pubKey] = await apiKeyModule.createApiKeys([
          { title: "kyc-spec", type: "publishable", created_by: "kyc-spec" },
        ])
        storeHeaders = { headers: { "x-publishable-api-key": pubKey.token } }

        const register = await api.post("/auth/seller/emailpass/register", {
          email: "kyc-seller@howsu.local",
          password: "supersecret",
        })
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

      it("gates courier offers on phone KYC when enabled", async () => {
        // post a job first
        const job = await api.post(
          "/store/delivery-jobs",
          { ...POST_JOB_BODY, orderId: "order_kyc_gate" },
          sellerAuth()
        )
        const jobId = job.data.job.id

        process.env.KYC_COURIER_GATE_ENABLED = "true"
        try {
          // unverified courier cannot make an offer
          await expect(
            api.post(
              `/store/delivery-jobs/${jobId}/offers`,
              { courierEmail: "unverified-kyc@howsu.local", offeredPrice: 4500 },
              storeHeaders
            )
          ).rejects.toMatchObject({
            response: { status: 400, data: { code: "kyc_required" } },
          })

          // verify the courier phone, then the same offer succeeds
          const requested = await api.post("/kyc/request", {
            email: "courier-verify-kyc@howsu.local",
            channel: "phone",
            destination: "+2348099999999",
          })
          await api.post("/kyc/verify", {
            email: "courier-verify-kyc@howsu.local",
            channel: "phone",
            destination: "+2348099999999",
            code: requested.data.code,
          })

          const ok = await api.post(
            `/store/delivery-jobs/${jobId}/offers`,
            { courierEmail: "courier-verify-kyc@howsu.local", offeredPrice: 4500 },
            storeHeaders
          )
          expect(ok.status).toEqual(201)
          expect(ok.data.offer.courier_email).toEqual("courier-verify-kyc@howsu.local")
        } finally {
          process.env.KYC_COURIER_GATE_ENABLED = "false"
        }
      })

      it("lets an unverified courier offer when the gate is off", async () => {
        const job = await api.post(
          "/store/delivery-jobs",
          { ...POST_JOB_BODY, orderId: "order_kyc_nogate" },
          sellerAuth()
        )
        const ok = await api.post(
          `/store/delivery-jobs/${job.data.job.id}/offers`,
          { courierEmail: "anyone-nogate@howsu.local", offeredPrice: 4500 },
          storeHeaders
        )
        expect(ok.status).toEqual(201)
      })

      it("surfaces the seller's KYC level on /sellers/me", async () => {
        // the runner restores the DB before every test, so build the profile
        // (and its level) within this test
        await api.post("/kyc/request", {
          email: "kyc-seller@howsu.local",
          channel: "phone",
          destination: "+2348011122233",
        })

        const res = await api.get("/sellers/me", sellerAuth())
        expect(res.status).toEqual(200)
        expect(res.data.kyc).not.toBeNull()
        expect(res.data.kyc.email).toEqual("kyc-seller@howsu.local")
        expect(res.data.kyc.level).toEqual("unverified")
      })
    })
  },
})

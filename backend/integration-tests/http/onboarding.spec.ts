import { medusaIntegrationTestRunner } from "@medusajs/test-utils"

jest.setTimeout(240 * 1000)

// KYC verification only "sends" when enabled; the mock channel returns the
// raw code so the complementary-identifier ladder is testable offline.
process.env.KYC_VERIFICATION_ENABLED = "true"
process.env.KYC_VERIFICATION_CHANNEL = "mock"

medusaIntegrationTestRunner({
  inApp: true,
  env: {},
  testSuite: ({ api, dbUtils }) => {
    describe("Phase 14 — frictionless onboarding (phone or email)", () => {
      describe("phone-first seller", () => {
        let token: string
        let sellerAuth: () => { headers: Record<string, string> }

        beforeAll(async () => {
          const register = await api.post("/auth/seller/phone/register", {
            phone: "+2348012345001",
            password: "supersecret",
          })
          expect(register.status).toEqual(200)

          const created = await api.post(
            "/sellers",
            {
              name: "Phone Seller",
              handle: "phone-seller",
              admin: {
                phone: "+2348012345001",
                first_name: "Ph",
                last_name: "Onie",
              },
            },
            {
              headers: { Authorization: `Bearer ${register.data.token}` },
            }
          )
          expect(created.status).toEqual(200)
          expect(created.data.seller.handle).toEqual("phone-seller")
          expect(created.data.seller.admins).toHaveLength(1)
          expect(created.data.seller.admins[0].phone).toEqual("+2348012345001")
          expect(created.data.seller.admins[0].email).toBeNull()

          const login = await api.post("/auth/seller/phone", {
            phone: "+2348012345001",
            password: "supersecret",
          })
          expect(login.status).toEqual(200)
          token = login.data.token
          sellerAuth = () => ({
            headers: { Authorization: `Bearer ${token}` },
          })
          await dbUtils.snapshot()
        })

        it("surfaces the phone on /sellers/me", async () => {
          const me = await api.get("/sellers/me", sellerAuth())
          expect(me.status).toEqual(200)
          expect(me.data.seller_admin.phone).toEqual("+2348012345001")
          expect(me.data.seller_admin.email).toBeNull()
        })

        it("rejects onboarding with neither an email nor a phone", async () => {
          const register = await api.post("/auth/seller/emailpass/register", {
            email: "noadmin-seller@howsu.local",
            password: "supersecret",
          })
          await expect(
            api.post(
              "/sellers",
              {
                name: "No Contact Seller",
                handle: "no-contact-seller",
                admin: { first_name: "No", last_name: "Contact" },
              },
              {
                headers: { Authorization: `Bearer ${register.data.token}` },
              }
            )
          ).rejects.toMatchObject({ response: { status: 400 } })
        })

        it("seeds the phone as KYC-verified at signup, then verifies the email", async () => {
          // phone is the signup identifier -> verified immediately
          const status = await api.get(
            "/kyc/status?phone=%2B2348012345001"
          )
          expect(status.data.profile).not.toBeNull()
          expect(status.data.profile.phone_verified).toBe(true)

          // complementary identifier (email) is still unverified
          const requested = await api.post("/kyc/request", {
            phone: "+2348012345001",
            channel: "email",
            destination: "phone-kyc@howsu.local",
          })
          expect(requested.data.code).toMatch(/^\d{6}$/)

          const verified = await api.post("/kyc/verify", {
            phone: "+2348012345001",
            channel: "email",
            destination: "phone-kyc@howsu.local",
            code: requested.data.code,
          })
          expect(verified.data.ok).toBe(true)
          expect(verified.data.profile.email).toEqual("phone-kyc@howsu.local")
          expect(verified.data.profile.email_verified).toBe(true)
          expect(verified.data.profile.phone_verified).toBe(true)
        })
      })

      describe("email-first seller", () => {
        let token: string
        let sellerAuth: () => { headers: Record<string, string> }

        beforeAll(async () => {
          const register = await api.post("/auth/seller/emailpass/register", {
            email: "email-onboard@howsu.local",
            password: "supersecret",
          })
          const created = await api.post(
            "/sellers",
            {
              name: "Email Seller",
              handle: "email-onboard",
              admin: {
                email: "email-onboard@howsu.local",
                first_name: "Em",
                last_name: "Ail",
              },
            },
            {
              headers: { Authorization: `Bearer ${register.data.token}` },
            }
          )
          expect(created.data.seller.admins[0].email).toEqual(
            "email-onboard@howsu.local"
          )
          expect(created.data.seller.admins[0].phone).toBeNull()

          const login = await api.post("/auth/seller/emailpass", {
            email: "email-onboard@howsu.local",
            password: "supersecret",
          })
          token = login.data.token
          sellerAuth = () => ({
            headers: { Authorization: `Bearer ${token}` },
          })
          await dbUtils.snapshot()
        })

        it("creates a mobile-first listing with photo + price + description", async () => {
          const created = await api.post(
            "/sellers/products",
            {
              title: "Mobile Silk Scarf",
              description:
                "Hand-dyed silk scarf, perfect for the Lagos heat.",
              price: 8500,
              photo: "https://cdn.howsu.local/silk-scarf.jpg",
            },
            sellerAuth()
          )
          expect(created.status).toEqual(200)
          const product = created.data.product
          expect(product.title).toEqual("Mobile Silk Scarf")
          expect(product.status).toEqual("published")
          expect(product.thumbnail).toEqual(
            "https://cdn.howsu.local/silk-scarf.jpg"
          )
          expect(product.images.map((i: { url: string }) => i.url)).toContain(
            "https://cdn.howsu.local/silk-scarf.jpg"
          )
          expect(product.options).toHaveLength(1)
          expect(product.variants).toHaveLength(1)
          expect(product.variants[0].prices[0].amount).toEqual(8500)
          expect(product.variants[0].prices[0].currency_code).toEqual("ngn")
        })

        it("allows the full admin shape to pass through unchanged", async () => {
          const created = await api.post(
            "/sellers/products",
            {
              title: "Full Shape Product",
              status: "draft",
              options: [{ title: "Color", values: ["Red", "Blue"] }],
              variants: [
                {
                  title: "Red",
                  prices: [{ currency_code: "ngn", amount: 1200 }],
                  manage_inventory: false,
                  options: { Color: "Red" },
                },
              ],
            },
            sellerAuth()
          )
          expect(created.status).toEqual(200)
          expect(created.data.product.status).toEqual("draft")
          expect(created.data.product.options).toHaveLength(1)
        })

        it("verifies the complementary phone number via KYC", async () => {
          const requested = await api.post("/kyc/request", {
            email: "email-onboard@howsu.local",
            channel: "phone",
            destination: "+2348012345999",
          })
          expect(requested.data.code).toMatch(/^\d{6}$/)

          const verified = await api.post("/kyc/verify", {
            email: "email-onboard@howsu.local",
            channel: "phone",
            destination: "+2348012345999",
            code: requested.data.code,
          })
          expect(verified.data.ok).toBe(true)
          expect(verified.data.profile.phone_verified).toBe(true)
          expect(verified.data.profile.email_verified).toBe(true)
        })
      })
    })
  },
})

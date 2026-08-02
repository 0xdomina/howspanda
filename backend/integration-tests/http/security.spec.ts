import { medusaIntegrationTestRunner } from "@medusajs/test-utils"

jest.setTimeout(120 * 1000)

process.env.PAYSTACK_SECRET_KEY = "mock"
process.env.CIRCLE_API_KEY = "mock"
process.env.CRYPTO_ENABLED = "false"
process.env.KYC_VERIFICATION_ENABLED = "true"
process.env.KYC_VERIFICATION_CHANNEL = "mock"

// The security spec enables rate limiting itself with a tiny limit (the shared
// .env.test flips RATE_LIMIT_ENABLED=false so other suites are not throttled).
// Env is read at request time, so set it up front and restore it afterward so
// the process-global env is clean for whatever suite runs next.
process.env.RATE_LIMIT_ENABLED = "true"
process.env.RATE_LIMIT_OTP_LIMIT = "3"

medusaIntegrationTestRunner({
  inApp: true,
  env: {},
  testSuite: ({ api, getContainer, dbUtils }) => {
    describe("Security — rate limiting (Phase 15)", () => {
      afterAll(() => {
        process.env.RATE_LIMIT_ENABLED = "false"
        delete process.env.RATE_LIMIT_OTP_LIMIT
      })

      const email = `ratelimit-${Date.now()}@howsu.local`

      it("allows requests under the window, then returns 429 once the limit is reached", async () => {
        // Hit the OTP endpoint with a brand-new email; keyed by that email the
        // first `limit` requests pass, the next one is throttled.
        const post = () =>
          api.post("/kyc/request", {
            email,
            channel: "email",
            destination: email,
          })

        const statuses: number[] = []
        let lastRes
        for (let i = 0; i < 3; i++) {
          lastRes = await post().catch((e) => e.response)
          statuses.push(lastRes.status)
        }
        // First three allowed.
        expect(statuses).toEqual([201, 201, 201])

        // Fourth request throttled.
        const blocked = await post().catch((e) => e.response)
        expect(blocked.status).toEqual(429)
        expect(blocked.data.retry_after_seconds).toBeGreaterThan(0)
      })

      it("rate limits different identities independently", async () => {
        const other = `ratelimit-other-${Date.now()}@howsu.local`
        const res = await api
          .post("/kyc/request", {
            email: other,
            channel: "email",
            destination: other,
          })
          .catch((e) => e.response)
        // A fresh identity is not affected by the first test's bucket.
        expect(res.status).toEqual(201)
      })
    })
  },
})
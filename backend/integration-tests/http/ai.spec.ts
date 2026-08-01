import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
import { AI_MODULE } from "../../src/modules/ai"
import AiModuleService from "../../src/modules/ai/service"

jest.setTimeout(120 * 1000)

// The suite runs with the deterministic mock provider — no API key, no
// network. mock-fail is toggled per-test via process.env (getModel() reads
// the env on every call).
process.env.AI_PROVIDER = "mock"
process.env.AI_FREE_TIER_MONTHLY_LIMIT = "5"

const onboardSeller = async (api: any, email: string, handle: string) => {
  const register = await api.post("/auth/seller/emailpass/register", {
    email,
    password: "supersecret",
  })

  await api.post(
    "/sellers",
    {
      name: handle,
      handle,
      admin: { email, first_name: "Ai", last_name: "Test" },
    },
    { headers: { Authorization: `Bearer ${register.data.token}` } }
  )

  const login = await api.post("/auth/seller/emailpass", {
    email,
    password: "supersecret",
  })

  return login.data.token as string
}

medusaIntegrationTestRunner({
  inApp: true,
  env: {},
  testSuite: ({ api, getContainer, dbUtils }) => {
    describe("AI module", () => {
      let aiService: AiModuleService
      let tokenA: string
      let tokenB: string

      beforeAll(() => {
        aiService = getContainer().resolve(AI_MODULE)
      })

      it("onboards two sellers with one owned product each", async () => {
        tokenA = await onboardSeller(api, "ai-a@howsu.local", "ai-seller-a")
        tokenB = await onboardSeller(api, "ai-b@howsu.local", "ai-seller-b")

        for (const [token, title] of [
          [tokenA, "Seller A Secret Scarf"],
          [tokenB, "Seller B Private Lamp"],
        ] as const) {
          const created = await api.post(
            "/sellers/products",
            {
              title,
              status: "published",
              options: [{ title: "Size", values: ["One"] }],
              variants: [
                {
                  title: "One Size",
                  prices: [{ currency_code: "ngn", amount: 5000 }],
                  manage_inventory: false,
                  options: { Size: "One" },
                },
              ],
            },
            { headers: { Authorization: `Bearer ${token}` } }
          )
          expect(created.status).toEqual(200)
        }

        // persist across the runner's per-test DB restore
        await dbUtils.snapshot()
      })

      describe("quota enforcement", () => {
        it("counts usage and blocks with a friendly 429 at the limit", async () => {
          const before = await api.get("/sellers/ai/quota", {
            headers: { Authorization: `Bearer ${tokenA}` },
          })
          expect(before.data.quota.limit).toEqual(5)

          const remaining = before.data.quota.remaining
          for (let i = 0; i < remaining; i++) {
            const ok = await api.post(
              "/sellers/ai/listing",
              { notes: "quota filler product notes" },
              { headers: { Authorization: `Bearer ${tokenA}` } }
            )
            expect(ok.status).toEqual(200)
            expect(ok.data.ok).toBe(true)
          }

          await expect(
            api.post(
              "/sellers/ai/listing",
              { notes: "one past the limit" },
              { headers: { Authorization: `Bearer ${tokenA}` } }
            )
          ).rejects.toMatchObject({
            response: {
              status: 429,
              data: { code: "quota_exhausted" },
            },
          })

          const after = await api.get("/sellers/ai/quota", {
            headers: { Authorization: `Bearer ${tokenA}` },
          })
          expect(after.data.quota.remaining).toEqual(0)
        })

        it("supports per-seller quota overrides", async () => {
          // the runner restores the DB before every test, so usage rows from
          // the previous test are gone — seed one here for the lookup
          const ok = await api.post(
            "/sellers/ai/listing",
            { notes: "seed one usage row" },
            { headers: { Authorization: `Bearer ${tokenA}` } }
          )
          expect(ok.status).toEqual(200)

          const [usage] = await aiService.listAiUsages({}, { take: 1 })
          const sellerId = usage.seller_id

          await aiService.createAiQuotas({
            seller_id: sellerId,
            monthly_limit: 50,
          })

          const status = await aiService.getQuotaStatus(sellerId)
          expect(status.limit).toEqual(50)
          expect(status.remaining).toBeGreaterThan(0)
        })
      })

      describe("per-seller isolation", () => {
        it("builds insights context ONLY from the caller's own data", async () => {
          const res = await api.post(
            "/sellers/ai/insights",
            { question: "what sold best this month?" },
            { headers: { Authorization: `Bearer ${tokenB}` } }
          )

          expect(res.status).toEqual(200)

          // the mock model captures the exact prompt it received
          const prompt = (globalThis as any).__howsuLastAiPrompt as string
          expect(prompt).toContain("Seller B Private Lamp")
          expect(prompt).not.toContain("Seller A Secret Scarf")
        })

        it("rejects unauthenticated AI calls", async () => {
          await expect(
            api.post("/sellers/ai/listing", { notes: "no auth" })
          ).rejects.toMatchObject({ response: { status: 401 } })
        })
      })

      describe("seller brief (Phase 13)", () => {
        it("returns a deterministic brief and stores it for instant GET", async () => {
          const res = await api.post(
            "/sellers/ai/brief",
            { period: "daily" },
            { headers: { Authorization: `Bearer ${tokenA}` } }
          )

          expect(res.status).toEqual(200)
          expect(res.data.ok).toBe(true)
          expect(res.data.capability).toEqual("brief")

          // deterministic numbers are computed in code, echoed back
          expect(res.data.numbers).toMatchObject({
            currency_code: "ngn",
            period: "daily",
            revenue: 0,
            commission: 0,
            net: 0,
            order_count: 0,
          })

          // narrative comes from the LLM (mock returns canned prose)
          expect(typeof res.data.result).toBe("string")
          expect(res.data.result.length).toBeGreaterThan(0)

          // persisted: GET is instant, no LLM call
          const stored = await api.get("/sellers/ai/brief", {
            headers: { Authorization: `Bearer ${tokenA}` },
          })
          expect(stored.status).toEqual(200)
          expect(stored.data.brief).not.toBeNull()
          expect(stored.data.brief.period).toEqual("daily")
          expect(stored.data.brief.seller_id).toEqual(res.data.brief.seller_id)
          expect(stored.data.brief.numbers).toMatchObject({
            currency_code: "ngn",
            period: "daily",
          })
        })

        it("never shares briefs across sellers (GET is scoped to the caller)", async () => {
          const posted = await api.post(
            "/sellers/ai/brief",
            { period: "weekly" },
            { headers: { Authorization: `Bearer ${tokenB}` } }
          )
          expect(posted.status).toEqual(200)

          const storedA = await api.get("/sellers/ai/brief", {
            headers: { Authorization: `Bearer ${tokenA}` },
          })
          const storedB = await api.get("/sellers/ai/brief", {
            params: { period: "weekly" },
            headers: { Authorization: `Bearer ${tokenB}` },
          })

          // A never stored one in this test — and it must NOT see B's weekly brief
          expect(storedA.data.brief).toBeNull()
          expect(storedB.data.brief).not.toBeNull()
          expect(storedB.data.brief.period).toEqual("weekly")
        })
      })

      describe("seller recommendations (Phase 13)", () => {
        it("returns rule-ranked opportunities scoped to the caller's catalog", async () => {
          const resA = await api.post(
            "/sellers/ai/recommendations",
            { period: "daily" },
            { headers: { Authorization: `Bearer ${tokenA}` } }
          )
          const resB = await api.post(
            "/sellers/ai/recommendations",
            { period: "daily" },
            { headers: { Authorization: `Bearer ${tokenB}` } }
          )

          expect(resA.status).toEqual(200)
          expect(resB.status).toEqual(200)
          expect(resA.data.capability).toEqual("recommendations")

          // each seller's opportunities reference their OWN product only
          const skusA = JSON.stringify(resA.data.opportunities)
          const skusB = JSON.stringify(resB.data.opportunities)
          expect(skusA).toContain("Seller A Secret Scarf")
          expect(skusA).not.toContain("Seller B Private Lamp")
          expect(skusB).toContain("Seller B Private Lamp")
          expect(skusB).not.toContain("Seller A Secret Scarf")

          // LLM explanations come back for every opportunity
          expect(Array.isArray(resA.data.result.opportunities)).toBe(true)
          expect(resA.data.result.opportunities.length).toBeGreaterThan(0)
        })
      })

      describe("provider failure fallback", () => {
        it("returns a friendly 503 and does not bill the seller", async () => {
          process.env.AI_PROVIDER = "mock-fail"

          try {
            const before = await api.get("/sellers/ai/quota", {
              headers: { Authorization: `Bearer ${tokenB}` },
            })

            await expect(
              api.post(
                "/sellers/ai/listing",
                { notes: "provider is down for this one" },
                { headers: { Authorization: `Bearer ${tokenB}` } }
              )
            ).rejects.toMatchObject({
              response: {
                status: 503,
                data: { code: "ai_unavailable" },
              },
            })

            const after = await api.get("/sellers/ai/quota", {
              headers: { Authorization: `Bearer ${tokenB}` },
            })
            expect(after.data.quota.used).toEqual(before.data.quota.used)

            // commerce keeps working while AI is down
            const products = await api.get("/sellers/products", {
              headers: { Authorization: `Bearer ${tokenB}` },
            })
            expect(products.status).toEqual(200)
          } finally {
            process.env.AI_PROVIDER = "mock"
          }
        })
      })
    })
  },
})

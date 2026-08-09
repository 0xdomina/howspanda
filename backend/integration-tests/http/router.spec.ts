import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
import { Modules } from "@medusajs/framework/utils"

jest.setTimeout(120 * 1000)

// Deterministic offline router: both enabled providers resolve to the mock
// model, so the round-robin rotation (which provider answers which message in
// a thread) is observable and stable across requests.
process.env.AI_PROVIDER = "mock"
process.env.AI_ROUTER_PROVIDERS = "groq,deepseek"
process.env.AI_ROUTER_STRATEGY = "round-robin"
process.env.AI_BUYER_CHAT_DAILY_LIMIT = "5"

const GUEST_A = "guest-key-aaaa-1111"
const GUEST_B = "guest-key-bbbb-2222"

medusaIntegrationTestRunner({
  inApp: true,
  env: {},
  testSuite: ({ api, getContainer }) => {
    describe("model router — buyer chat", () => {
      let storeHeaders: { headers: Record<string, string> }

      beforeAll(async () => {
        // store routes demand a publishable key — mint one directly
        const apiKeyModule = getContainer().resolve(Modules.API_KEY)
        const [pubKey] = await apiKeyModule.createApiKeys([
          { title: "router-spec", type: "publishable", created_by: "router-spec" },
        ])
        storeHeaders = { headers: { "x-publishable-api-key": pubKey.token } }
      })

      // Register + finish a customer account (register token -> create customer).
      const registerCustomer = async (email: string) => {
        const reg = await api.post("/auth/customer/emailpass/register", {
          email,
          password: "supersecret",
        })
        await api.post(
          "/store/customers",
          { email },
          {
            headers: {
              authorization: `Bearer ${reg.data.token}`,
              ...storeHeaders.headers,
            },
          }
        )
        const login = await api.post("/auth/customer/emailpass", {
          email,
          password: "supersecret",
        })
        return login.data.token as string
      }

      const chat = async (body: any, headers: Record<string, string> = {}) =>
        api.post("/store/ai/chat", body, {
          headers: { ...storeHeaders.headers, ...headers },
        })

      const history = async (params: Record<string, string>, headers: Record<string, string> = {}) =>
        api.get("/store/ai/chat", {
          params,
          headers: { ...storeHeaders.headers, ...headers },
        })

      describe("guest chat (client_key identity)", () => {
        it("starts a conversation, replies, and records the answering provider", async () => {
          const res = await chat({
            client_key: GUEST_A,
            message: "How do returns work?",
          })

          expect(res.status).toEqual(200)
          expect(res.data.ok).toBe(true)
          expect(res.data.conversation_id).toBeDefined()
          expect(res.data.reply).toContain("Mock reply")
          expect(["groq", "deepseek"]).toContain(res.data.provider)
          expect(res.data.model_id).toBeDefined()
        })

        it("continues the same thread and rotates the answering provider per message", async () => {
          const first = await chat({
            client_key: GUEST_A,
            message: "first",
          })
          const conv = first.data.conversation_id
          expect(first.status).toEqual(200)

          const second = await chat({
            client_key: GUEST_A,
            conversation_id: conv,
            message: "second",
          })
          expect(second.status).toEqual(200)
          expect(second.data.conversation_id).toEqual(conv)

          // round-robin across groq+deepseek: two consecutive messages in the
          // same thread must be answered by different providers
          expect(first.data.provider).not.toEqual(second.data.provider)

          const hist = await history({
            conversation_id: conv,
            client_key: GUEST_A,
          })
          expect(hist.status).toEqual(200)

          const assistants = hist.data.messages.filter(
            (m: any) => m.role === "assistant"
          )
          expect(assistants.length).toEqual(2)
          expect(assistants[0].provider).not.toEqual(assistants[1].provider)
          expect(assistants[0].model_id).toBeDefined()

          // every turn replays the full history (system + prior turns)
          const roles = hist.data.messages.map((m: any) => m.role)
          expect(roles).toContain("system")
          expect(roles.filter((r: string) => r === "user").length).toEqual(2)
        })

        it("keeps threads private between guest keys and customers", async () => {
          const a = await chat({
            client_key: GUEST_A,
            message: "private to A",
          })
          const convA = a.data.conversation_id

          // a different guest cannot read A's thread
          await expect(
            history({ conversation_id: convA, client_key: GUEST_B })
          ).rejects.toMatchObject({ response: { status: 404 } })

          // a signed-in customer cannot read it either
          const tokenB = await registerCustomer( "router-b@howsu.local")
          await expect(
            history(
              { conversation_id: convA },
              { authorization: `Bearer ${tokenB}` }
            )
          ).rejects.toMatchObject({ response: { status: 404 } })
        })

        it("lists conversations scoped to the guest key only", async () => {
          await chat({
            client_key: GUEST_A,
            message: "one",
            title: "Question one",
          })
          await chat({
            client_key: GUEST_A,
            message: "two",
          })

          const list = await api.get("/store/ai/chat/conversations", {
            params: { client_key: GUEST_A },
            headers: storeHeaders.headers,
          })
          expect(list.status).toEqual(200)
          expect(list.data.conversations.length).toBeGreaterThanOrEqual(2)

          const listB = await api.get("/store/ai/chat/conversations", {
            params: { client_key: GUEST_B },
            headers: storeHeaders.headers,
          })
          expect(
            listB.data.conversations.some((c: any) => c.title === "Question one")
          ).toBe(false)
        })
      })

      describe("customer chat (JWT identity)", () => {
        it("identifies signed-in customers by their auth actor", async () => {
          const tokenA = await registerCustomer( "router-a@howsu.local")

          const res = await chat(
            { message: "hi from a customer" },
            { authorization: `Bearer ${tokenA}` }
          )
          expect(res.status).toEqual(200)
          expect(res.data.ok).toBe(true)
          expect(res.data.conversation_id).toBeDefined()

          // the actor's own thread is readable with just the JWT (no client_key)
          const hist = await history(
            { conversation_id: res.data.conversation_id },
            { authorization: `Bearer ${tokenA}` }
          )
          expect(hist.status).toEqual(200)
          expect(
            hist.data.messages.some((m: any) => m.role === "user")
          ).toBe(true)
        })

        it("does not let one customer read another customer's thread", async () => {
          const tokenA = await registerCustomer( "router-c1@howsu.local")
          const tokenB = await registerCustomer( "router-c2@howsu.local")

          const res = await chat(
            { message: "mine" },
            { authorization: `Bearer ${tokenA}` }
          )

          await expect(
            history(
              { conversation_id: res.data.conversation_id },
              { authorization: `Bearer ${tokenB}` }
            )
          ).rejects.toMatchObject({ response: { status: 404 } })
        })
      })

      describe("daily quota", () => {
        it("blocks the 6th free chat with a friendly 429", async () => {
          for (let i = 0; i < 5; i++) {
            const ok = await chat({
              client_key: GUEST_A,
              message: `turn ${i}`,
            })
            expect(ok.status).toEqual(200)
          }

          await expect(
            chat({
              client_key: GUEST_A,
              message: "one past the limit",
            })
          ).rejects.toMatchObject({
            response: { status: 429, data: { code: "quota_exhausted" } },
          })
        })
      })
    })
  },
})

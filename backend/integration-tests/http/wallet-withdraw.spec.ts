import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
import { Modules } from "@medusajs/framework/utils"
import { USER_WALLET_MODULE } from "../../src/modules/user-wallet"
import UserWalletModuleService from "../../src/modules/user-wallet/service"
import { mockConfirmSpend } from "../../src/lib/payments/wallets/mock"

jest.setTimeout(240 * 1000)

// Deterministic offline rail: CRYPTO_WALLET_SIGNER=mock forces the in-process
// mock signer so this suite never touches a chain or a real key.
process.env.PAYSTACK_SECRET_KEY = "mock"
process.env.CIRCLE_API_KEY = "mock"
process.env.CRYPTO_ENABLED = "true"
process.env.CRYPTO_WALLET_SIGNER = "mock"

const TO_ADDRESS = "0x000000000000000000000000000000000000dead"

// NOTE: the integration runner restores the DB snapshot before EVERY `it`, so
// each test below builds (and asserts on) its own spend within the same test.
// Module-level mock balances survive the restore; DB rows do not.
medusaIntegrationTestRunner({
  inApp: true,
  env: {},
  testSuite: ({ api, getContainer }) => {
    describe("User crypto wallet — external USDC sends (password re-confirmation)", () => {
      let walletModule: UserWalletModuleService
      let storeHeaders: { headers: Record<string, string> }
      let buyerAuth: { headers: Record<string, string> }
      let customerId: string

      const EMAIL = "wallet-withdraw@howsu.local"
      const PASSWORD = "supersecret"

      const withdraw = (body: Record<string, unknown>) =>
        api.post("/store/crypto-wallet/withdraw", body, buyerAuth)

      beforeAll(async () => {
        walletModule = getContainer().resolve(USER_WALLET_MODULE)

        const apiKeyModule = getContainer().resolve(Modules.API_KEY)
        const [pubKey] = await apiKeyModule.createApiKeys([
          {
            title: "wallet-withdraw-spec",
            type: "publishable",
            created_by: "wallet-withdraw-spec",
          },
        ])
        storeHeaders = { headers: { "x-publishable-api-key": pubKey.token } }

        // register → create customer → login (the storefront signup flow)
        const register = await api.post("/auth/customer/emailpass/register", {
          email: EMAIL,
          password: PASSWORD,
        })
        expect(register.status).toEqual(200)

        const created = await api.post(
          "/store/customers",
          { email: EMAIL, first_name: "Withdraw", last_name: "Buyer" },
          {
            headers: {
              authorization: `Bearer ${register.data.token}`,
              ...storeHeaders.headers,
            },
          }
        )
        customerId = created.data.customer.id

        const login = await api.post("/auth/customer/emailpass", {
          email: EMAIL,
          password: PASSWORD,
        })
        expect(login.status).toEqual(200)
        buyerAuth = {
          headers: {
            authorization: `Bearer ${login.data.token}`,
            ...storeHeaders.headers,
          },
        }

        // Wallet + a funded balance (mock-only store route). The balance lives
        // in the module-level mock map, so it survives per-test DB restores.
        await api.get("/store/crypto-wallet", buyerAuth)
        const fund = await api.post(
          "/store/crypto-wallet/fund",
          { amount: 10_000 },
          buyerAuth
        )
        expect(fund.data.balance_usdc).toEqual("10000.00")
      })

      it("refuses an external send when the password re-entry is wrong (401, no intent recorded)", async () => {
        await expect(
          withdraw({
            to_address: TO_ADDRESS,
            usdc_amount: "5.00",
            password: "not-the-password",
            idempotency_key: "withdraw-spec-wrong",
          })
        ).rejects.toMatchObject({ response: { status: 401 } })

        // A failed confirmation must not leave any intent row behind.
        const rows = await walletModule.listWalletSpends({
          idempotency_key: "withdraw-spec-wrong",
        })
        expect(rows.length).toEqual(0)
      })

      it("refuses a malformed destination address (400)", async () => {
        await expect(
          withdraw({
            to_address: "0x123",
            usdc_amount: "5.00",
            password: PASSWORD,
            idempotency_key: "withdraw-spec-badaddr",
          })
        ).rejects.toMatchObject({ response: { status: 400 } })
      })

      it("refuses a withdraw above the wallet balance without debiting (400)", async () => {
        await expect(
          withdraw({
            to_address: TO_ADDRESS,
            usdc_amount: "99999.00",
            password: PASSWORD,
            idempotency_key: "withdraw-spec-over",
          })
        ).rejects.toMatchObject({ response: { status: 400 } })

        const after = await api.get("/store/crypto-wallet", buyerAuth)
        expect(after.data.balance_usdc).toEqual("10000.00")
      })

      it("sends USDC to an external address after password re-confirmation; a replay never double-debits", async () => {
        const sent = await withdraw({
          to_address: TO_ADDRESS,
          usdc_amount: "10.50",
          password: PASSWORD,
          idempotency_key: "withdraw-spec-1",
        })
        expect(sent.status).toEqual(200)
        expect(sent.data.spend.status).toEqual("signed")
        expect(sent.data.spend.to_address).toEqual(TO_ADDRESS)
        expect(sent.data.spend.tx_hash).toContain("0xmockwallet")
        const spendId = sent.data.spend.id

        const after = await api.get("/store/crypto-wallet", buyerAuth)
        expect(after.data.balance_usdc).toEqual("9989.50")

        // replay → same spend id, no second debit
        const replay = await withdraw({
          to_address: TO_ADDRESS,
          usdc_amount: "10.50",
          password: PASSWORD,
          idempotency_key: "withdraw-spec-1",
        })
        expect(replay.status).toEqual(200)
        expect(replay.data.spend.id).toEqual(spendId)

        const afterReplay = await api.get("/store/crypto-wallet", buyerAuth)
        expect(afterReplay.data.balance_usdc).toEqual("9989.50")
      })

      it("reconciles a signed spend to confirmed once the chain reports the receipt", async () => {
        const sent = await withdraw({
          to_address: TO_ADDRESS,
          usdc_amount: "10.50",
          password: PASSWORD,
          idempotency_key: "withdraw-spec-recon",
        })
        const spendId = sent.data.spend.id

        // In flight → reconcile leaves it signed.
        const inFlight = await walletModule.reconcileSpend({ id: spendId })
        expect(inFlight.status).toEqual("signed")

        // Chain confirms → the sweep applies the terminal verdict.
        mockConfirmSpend("withdraw:withdraw-spec-recon")
        const reconciled = await walletModule.reconcileSpend({ id: spendId })
        expect(reconciled.status).toEqual("confirmed")

        // The actor-facing check reflects the same terminal state.
        const checked = await walletModule.checkSpend({
          actor_type: "customer",
          actor_id: customerId,
          idempotency_key: "withdraw-spec-recon",
        })
        expect(checked.status).toEqual("confirmed")
      })
    })
  },
})

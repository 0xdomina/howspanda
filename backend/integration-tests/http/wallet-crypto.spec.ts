import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
import { Modules } from "@medusajs/framework/utils"
import { USER_WALLET_MODULE } from "../../src/modules/user-wallet"
import UserWalletModuleService from "../../src/modules/user-wallet/service"
import {
  MockUserWalletSigner,
  mockFundWallet,
} from "../../src/lib/payments/wallets/mock"
import { getUserWalletSigner } from "../../src/lib/payments/wallets"
import { getCryptoSettlement } from "../../src/lib/payments/crypto"
import { MockCryptoSettlement } from "../../src/lib/payments/crypto/mock"
import { ArcCryptoSettlement } from "../../src/lib/payments/crypto/arc"
import { ArcUserWalletSigner } from "../../src/lib/payments/wallets/arc"

jest.setTimeout(240 * 1000)

// Deterministic offline rails. CRYPTO_WALLET_SIGNER=mock forces BOTH the
// per-user wallet signer and the settlement rail to the offline mock even if
// .env carries an ARC_MNEMONIC — so this suite never touches a chain or a key.
process.env.PAYSTACK_SECRET_KEY = "mock"
process.env.CIRCLE_API_KEY = "mock"
process.env.CRYPTO_ENABLED = "true"
process.env.CRYPTO_WALLET_SIGNER = "mock"

describe("User wallet signer factory — mock override", () => {
  afterAll(() => {
    process.env.CRYPTO_WALLET_SIGNER = "mock"
    delete process.env.ARC_MNEMONIC
  })

  it("forces the mock signer + mock settlement when CRYPTO_WALLET_SIGNER=mock, even with Arc configured", () => {
    process.env.ARC_MNEMONIC = "test mnemonic words go here"
    process.env.CRYPTO_WALLET_SIGNER = "mock"

    expect(getUserWalletSigner("arc")).toBeInstanceOf(MockUserWalletSigner)
    expect(getCryptoSettlement("arc")).toBeInstanceOf(MockCryptoSettlement)
  })

  it("resolves the live Arc signer + settlement when the override is unset", () => {
    delete process.env.CRYPTO_WALLET_SIGNER
    process.env.ARC_MNEMONIC = "test mnemonic words go here"

    expect(getUserWalletSigner("arc")).toBeInstanceOf(ArcUserWalletSigner)
    expect(getCryptoSettlement("arc")).toBeInstanceOf(ArcCryptoSettlement)
  })
})

medusaIntegrationTestRunner({
  inApp: true,
  env: {},
  testSuite: ({ api, getContainer }) => {
    describe("User crypto wallet — signup, fund, spend (managed wallet)", () => {
      let walletModule: UserWalletModuleService
      let storeHeaders: { headers: Record<string, string> }
      let buyerAuth: { headers: Record<string, string> }
      let customerId: string

      const EMAIL = "crypto-wallet@howsu.local"

      beforeAll(async () => {
        walletModule = getContainer().resolve(USER_WALLET_MODULE)

        const apiKeyModule = getContainer().resolve(Modules.API_KEY)
        const [pubKey] = await apiKeyModule.createApiKeys([
          {
            title: "wallet-crypto-spec",
            type: "publishable",
            created_by: "wallet-crypto-spec",
          },
        ])
        storeHeaders = { headers: { "x-publishable-api-key": pubKey.token } }

        // register → create customer → login (the storefront signup flow)
        const register = await api.post("/auth/customer/emailpass/register", {
          email: EMAIL,
          password: "supersecret",
        })
        expect(register.status).toEqual(200)
        expect(register.data.token).toBeTruthy()

        const created = await api.post(
          "/store/customers",
          { email: EMAIL, first_name: "Crypto", last_name: "Buyer" },
          {
            headers: {
              authorization: `Bearer ${register.data.token}`,
              ...storeHeaders.headers,
            },
          }
        )
        expect(created.status).toEqual(200)
        customerId = created.data.customer.id

        const login = await api.post("/auth/customer/emailpass", {
          email: EMAIL,
          password: "supersecret",
        })
        expect(login.status).toEqual(200)
        buyerAuth = {
          headers: {
            authorization: `Bearer ${login.data.token}`,
            ...storeHeaders.headers,
          },
        }
      })

      it("auto-creates a deterministic mock wallet on first view, reports 0 balance", async () => {
        const first = await api.get("/store/crypto-wallet", buyerAuth)
        expect(first.status).toEqual(200)
        expect(first.data.wallet.network).toEqual("arc")
        expect(first.data.wallet.env).toEqual("testnet")
        expect(first.data.wallet.address).toMatch(/^mock-arc-/)
        expect(first.data.balance_usdc).toEqual("0")

        // second view returns the SAME row — no new wallet per request
        const second = await api.get("/store/crypto-wallet", buyerAuth)
        expect(second.data.wallet.address).toEqual(first.data.wallet.address)
      })

      it("funds the managed wallet via the mock-only store route", async () => {
        const fund = await api.post(
          "/store/crypto-wallet/fund",
          { amount: 10_000 },
          buyerAuth
        )
        expect(fund.status).toEqual(200)
        expect(fund.data.balance_usdc).toEqual("10000.00")

        const after = await api.get("/store/crypto-wallet", buyerAuth)
        expect(after.data.balance_usdc).toEqual("10000.00")
      })

      it("spends once, and a replay of the same idempotency key never double-debits", async () => {
        const { wallet } = await walletModule.getOrCreateWallet({
          actor_type: "customer",
          actor_id: customerId,
          wallet_key: customerId,
        })
        mockFundWallet(wallet.address, "500.00")

        const intent = await walletModule.createSpendIntent({
          actor_type: "customer",
          actor_id: customerId,
          idempotency_key: "spec-spend-1",
          to_address: "0x000000000000000000000000000000000000dead",
          usdc_amount: "10.50",
          reference: "spec-ref-1",
        })
        expect(intent.spend.status).toEqual("pending")

        const signed = await walletModule.signSpend({
          actor_type: "customer",
          actor_id: customerId,
          idempotency_key: "spec-spend-1",
        })
        expect(signed.status).toEqual("signed")
        expect(signed.tx_hash).toContain("0xmockwallet")

        const after = await walletModule.getWalletInfo({
          actor_type: "customer",
          actor_id: customerId,
        })
        expect(after!.balance_usdc).toEqual("489.50")

        // replay → same signed row, balance untouched (single debit)
        const replay = await walletModule.signSpend({
          actor_type: "customer",
          actor_id: customerId,
          idempotency_key: "spec-spend-1",
        })
        expect(replay.id).toEqual(signed.id)
        const afterReplay = await walletModule.getWalletInfo({
          actor_type: "customer",
          actor_id: customerId,
        })
        expect(afterReplay!.balance_usdc).toEqual("489.50")
      })

      it("a fresh idempotency key debits again; an over-balance spend fails without debiting", async () => {
        const { wallet } = await walletModule.getOrCreateWallet({
          actor_type: "customer",
          actor_id: customerId,
          wallet_key: customerId,
        })
        mockFundWallet(wallet.address, "100.00")

        await walletModule.createSpendIntent({
          actor_type: "customer",
          actor_id: customerId,
          idempotency_key: "spec-spend-2",
          to_address: "0x000000000000000000000000000000000000dead",
          usdc_amount: "20.00",
          reference: "spec-ref-2",
        })
        await walletModule.signSpend({
          actor_type: "customer",
          actor_id: customerId,
          idempotency_key: "spec-spend-2",
        })
        let balance = await walletModule.getWalletInfo({
          actor_type: "customer",
          actor_id: customerId,
        })
        expect(balance!.balance_usdc).toEqual("80.00")

        // over-balance → refused, and the refusal must not touch the balance
        await walletModule.createSpendIntent({
          actor_type: "customer",
          actor_id: customerId,
          idempotency_key: "spec-spend-over",
          to_address: "0x000000000000000000000000000000000000dead",
          usdc_amount: "9999.00",
          reference: "spec-ref-over",
        })
        await expect(
          walletModule.signSpend({
            actor_type: "customer",
            actor_id: customerId,
            idempotency_key: "spec-spend-over",
          })
        ).rejects.toThrow(/balance too low/i)

        balance = await walletModule.getWalletInfo({
          actor_type: "customer",
          actor_id: customerId,
        })
        expect(balance!.balance_usdc).toEqual("80.00")
      })

      it("rejects fund without a bearer token (401)", async () => {
        await expect(
          api.post("/store/crypto-wallet/fund", { amount: 100 }, storeHeaders)
        ).rejects.toMatchObject({ response: { status: 401 } })
      })
    })
  },
})

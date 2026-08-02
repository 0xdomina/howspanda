import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
import { Modules } from "@medusajs/framework/utils"
import PaystackProviderService from "../../src/modules/payment-providers/paystack/service"
import FlutterwaveProviderService from "../../src/modules/payment-providers/flutterwave/service"
import CryptoUsdcProviderService from "../../src/modules/payment-providers/crypto-usdc/service"
import {
  rankProviders,
  PAYSTACK_ID,
  FLUTTERWAVE_ID,
  CRYPTO_USDC_ID,
} from "../../src/lib/payments/fees"
import { getCryptoSettlement, quoteUsdc } from "../../src/lib/payments/crypto"

jest.setTimeout(120 * 1000)

// Every provider defaults to deterministic offline mock mode — no secrets, no
// network. The crypto factory reads these on each call.
process.env.PAYSTACK_SECRET_KEY = "mock"
process.env.FLUTTERWAVE_SECRET_KEY = "mock"
process.env.CIRCLE_API_KEY = "mock"
process.env.CRYPTO_ENABLED = "true"

// A minimal module container is enough: the mock provider paths never touch it.
const container = { logger: console } as unknown as Record<string, unknown>

const initInput = (amount: number, extra: Record<string, any> = {}) =>
  ({
    amount,
    currency_code: "ngn",
    data: {},
    context: {},
    ...extra,
  }) as any

/**
 * Fee routing, provider mock state machines, and the network-agnostic crypto
 * settlement seam — the deterministic units behind the payment flows.
 *
 * The full store checkout → order → commission line is proven end-to-end in the
 * Phase 4 live proof, and commission-line creation / one-line-per-order is
 * covered in marketplace.spec.ts (the integration runner boots an un-seeded DB,
 * so it carries no Nigeria region / shipping to complete a real cart here).
 */
describe("Payments — fee routing", () => {
  it("ranks cheapest-first and recommends the zero-fee USDC rail at ₦10k", () => {
    // ₦10,000 = 1,000,000 kobo
    const options = rankProviders(1_000_000, [
      PAYSTACK_ID,
      FLUTTERWAVE_ID,
      CRYPTO_USDC_ID,
    ])

    // ascending by fee: crypto (0) < flutterwave (14,000) < paystack (25,000)
    expect(options.map((o) => o.provider_id)).toEqual([
      CRYPTO_USDC_ID,
      FLUTTERWAVE_ID,
      PAYSTACK_ID,
    ])
    expect(options.find((o) => o.provider_id === FLUTTERWAVE_ID)!.fee).toEqual(
      14_000
    )
    expect(options.find((o) => o.provider_id === PAYSTACK_ID)!.fee).toEqual(
      25_000
    )

    // USDC is the frictionless managed-wallet default — cheapest AND recommended.
    const recommended = options.filter((o) => o.recommended)
    expect(recommended).toHaveLength(1)
    expect(recommended[0].provider_id).toEqual(CRYPTO_USDC_ID)
    expect(
      options.find((o) => o.provider_id === CRYPTO_USDC_ID)!.recommended
    ).toBe(true)
  })

  it("lists crypto only when it is among the enabled providers", () => {
    const fiatOnly = rankProviders(1_000_000, [PAYSTACK_ID, FLUTTERWAVE_ID])
    expect(fiatOnly.map((o) => o.provider_id)).not.toContain(CRYPTO_USDC_ID)

    const withCrypto = rankProviders(1_000_000, [
      PAYSTACK_ID,
      FLUTTERWAVE_ID,
      CRYPTO_USDC_ID,
    ])
    expect(withCrypto.map((o) => o.provider_id)).toContain(CRYPTO_USDC_ID)
  })
})

describe("Payments — Paystack provider (mock)", () => {
  const paystack = new PaystackProviderService(container, { secretKey: "mock" })

  it("initiates a pending hosted-checkout session, then authorizes it", async () => {
    const init = await paystack.initiatePayment(initInput(175))
    expect(init.status).toEqual("pending")
    expect((init.data as any).mock).toBe(true)
    expect((init.data as any).authorization_url).toContain("paystack")

    const auth = await paystack.authorizePayment({ data: init.data } as any)
    expect(auth.status).toEqual("authorized")
  })

  it("maps a failed webhook to `failed` — never silently authorizes", async () => {
    const success = await paystack.getWebhookActionAndData({
      data: { event: "charge.success", session_id: "s1", amount: 175 },
    } as any)
    expect(success.action).toEqual("captured")

    const failed = await paystack.getWebhookActionAndData({
      data: { event: "charge.failed", session_id: "s1", amount: 175 },
    } as any)
    expect(failed.action).toEqual("failed")
  })
})

describe("Payments — Flutterwave provider (mock)", () => {
  const flutterwave = new FlutterwaveProviderService(container, {
    secretKey: "mock",
  })

  it("initiates a pending session and authorizes it", async () => {
    const init = await flutterwave.initiatePayment(initInput(175))
    expect(init.status).toEqual("pending")

    const auth = await flutterwave.authorizePayment({ data: init.data } as any)
    expect(auth.status).toEqual("authorized")
  })
})

describe("Payments — crypto USDC provider (mock)", () => {
  const crypto = new CryptoUsdcProviderService(container, {})

  it("initiates a Base-testnet deposit intent with a USDC quote", async () => {
    const init = await crypto.initiatePayment(initInput(17_500))
    expect(init.status).toEqual("pending")

    const data = init.data as any
    expect(data.network).toEqual("base")
    expect(data.env).toEqual("testnet")
    expect(data.address).toContain("mock-base-")
    // per-intent wallet (correlation fix) — no longer a shared network wallet
    expect(data.wallet_id).toEqual(`mock-wallet-${data.reference}`)
    // ₦17,500 ÷ ₦1,600 = 10.9375 → "10.94"
    expect(data.usdc_amount).toEqual("10.94")
  })

  it("authorizes pending → authorized as on-chain settlement confirms", async () => {
    const init = await crypto.initiatePayment(initInput(17_500))

    // first poll: awaiting on-chain confirmation
    const first = await crypto.authorizePayment({ data: init.data } as any)
    expect(first.status).toEqual("pending_authorization")

    // subsequent poll: confirmed
    const second = await crypto.authorizePayment({ data: init.data } as any)
    expect(second.status).toEqual("authorized")
  })

  it("keeps two concurrent intents isolated — no cross-confirmation", async () => {
    const a = await crypto.initiatePayment(initInput(17_500))
    const b = await crypto.initiatePayment(initInput(32_000))

    // distinct per-intent deposit addresses + wallets
    expect((a.data as any).address).not.toEqual((b.data as any).address)
    expect((a.data as any).wallet_id).not.toEqual((b.data as any).wallet_id)

    // confirming A must not confirm B: A polls twice → authorized, while B's
    // first-and-only poll stays pending.
    await crypto.authorizePayment({ data: a.data } as any)
    const aDone = await crypto.authorizePayment({ data: a.data } as any)
    expect(aDone.status).toEqual("authorized")

    const bFirst = await crypto.authorizePayment({ data: b.data } as any)
    expect(bFirst.status).toEqual("pending_authorization")
  })
})

describe("Payments — network-agnostic crypto settlement", () => {
  it("switches network and testnet↔mainnet purely by config", () => {
    expect(getCryptoSettlement("base").network).toEqual("base")
    expect(getCryptoSettlement("solana").network).toEqual("solana")

    const prev = process.env.CRYPTO_NETWORK_ENV
    try {
      expect(getCryptoSettlement().env).toEqual("testnet")
      process.env.CRYPTO_NETWORK_ENV = "mainnet"
      expect(getCryptoSettlement().env).toEqual("mainnet")
    } finally {
      if (prev === undefined) delete process.env.CRYPTO_NETWORK_ENV
      else process.env.CRYPTO_NETWORK_ENV = prev
    }
  })

  it("rejects an unknown network instead of silently picking a wrong chain", () => {
    expect(() => getCryptoSettlement("dogecoin")).toThrow(
      /Unknown crypto network/
    )
  })

  it("quotes USDC deterministically from the configured rate", () => {
    expect(quoteUsdc(16_000)).toEqual("10.00")
    expect(quoteUsdc(17_500)).toEqual("10.94")
  })
})

/**
 * In-app boot check: boots the full Medusa app against a freshly-migrated temp
 * DB and proves the 3 payment providers register as enabled and /health stays 200.
 *
 * Like the other in-app specs (health/marketplace/ai) this needs a running Postgres
 * and DB_HOST/DB_PORT/DB_USERNAME/DB_PASSWORD in the environment; the deterministic
 * units above run offline with no DB.
 */
medusaIntegrationTestRunner({
  inApp: true,
  env: {},
  testSuite: ({ api, getContainer }) => {
    describe("Payments — in-app registration + no-regression", () => {
      it("registers Paystack, Flutterwave and crypto-usdc as enabled providers", async () => {
        const paymentService = getContainer().resolve(Modules.PAYMENT)
        const providers = await paymentService.listPaymentProviders({})
        const ids = providers.map((p: any) => p.id)

        expect(ids).toEqual(
          expect.arrayContaining([PAYSTACK_ID, FLUTTERWAVE_ID, CRYPTO_USDC_ID])
        )
        for (const id of [PAYSTACK_ID, FLUTTERWAVE_ID, CRYPTO_USDC_ID]) {
          expect(providers.find((p: any) => p.id === id)!.is_enabled).toBe(
            true
          )
        }
      })

      it("keeps /health responding 200", async () => {
        const res = await api.get("/health")
        expect(res.status).toEqual(200)
      })
    })
  },
})

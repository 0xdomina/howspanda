import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
import { Modules } from "@medusajs/framework/utils"
import {
  PaystackTransferError,
  createRecipient,
  initiateTransfer,
  resolveAccount,
  verifyTransfer,
} from "../../src/lib/payments/payouts/paystack-transfers"
import { reconcilePayout } from "../../src/lib/payments/payouts/reconcile"
import { getCryptoSettlement } from "../../src/lib/payments/crypto"
import { MARKETPLACE_MODULE } from "../../src/modules/marketplace"
import MarketplaceModuleService from "../../src/modules/marketplace/service"
import {
  PAYSTACK_ID,
  FLUTTERWAVE_ID,
  CRYPTO_USDC_ID,
} from "../../src/lib/payments/fees"

jest.setTimeout(120 * 1000)

// Deterministic offline mock mode everywhere; a 0-day fallback release and a
// ₦1 minimum so freshly seeded commission lines are sweepable immediately.
process.env.PAYSTACK_SECRET_KEY = "mock"
process.env.CIRCLE_API_KEY = "mock"
process.env.CRYPTO_ENABLED = "true"
process.env.ESCROW_FALLBACK_RELEASE_DAYS = "0"
process.env.PAYOUT_MIN_NGN = "1"
process.env.PAYOUT_SCHEDULE_ENABLED = "false"

/**
 * Offline deterministic units for the two payout rails — no DB, no network.
 * The full ledger → payout → webhook/reconcile lifecycle is proven in-app
 * below (and in the Phase 5 live proof).
 */
describe("Payouts — Paystack Transfers client (mock)", () => {
  it("resolves an account name and mints a deterministic recipient", async () => {
    const resolved = await resolveAccount("0123456789", "058")
    expect(resolved.account_name).toEqual("MOCK ACCOUNT 6789")

    const recipient = await createRecipient({
      name: resolved.account_name,
      account_number: "0123456789",
      bank_code: "058",
    })
    expect(recipient.recipient_code).toEqual("RCP_mock_0123456789")
  })

  it("fails name-resolve for account numbers starting with 00", async () => {
    await expect(resolveAccount("0011223344", "058")).rejects.toThrow(
      PaystackTransferError
    )
  })

  it("initiates a transfer and verifies pending → success", async () => {
    const transfer = await initiateTransfer({
      amount_major: 10_000,
      recipient_code: "RCP_mock_0123456789",
      reference: "po_spec_ok",
    })
    expect(transfer.transfer_code).toEqual("TRF_mock_po_spec_ok")
    expect(transfer.status).toEqual("pending")

    const first = await verifyTransfer("po_spec_ok")
    expect(first.status).toEqual("pending")
    const second = await verifyTransfer("po_spec_ok")
    expect(second.status).toEqual("success")
  })

  it("verifies a reference containing 'fail' as failed with a reason", async () => {
    const verification = await verifyTransfer("po_spec_fail")
    expect(verification.status).toEqual("failed")
    expect(verification.failure_reason).toBeTruthy()
  })
})

describe("Payouts — crypto withdrawal seam (mock)", () => {
  const settlement = getCryptoSettlement("base")

  it("creates a withdrawal that confirms on the second poll with a tx hash", async () => {
    const created = await settlement.createWithdrawal({
      reference: "po_spec_crypto",
      address: "0x1111222233334444555566667777888899990000",
      usdc_amount: "6.25",
    })
    expect(created.status).toEqual("pending")

    const first = await settlement.checkWithdrawal("po_spec_crypto")
    expect(first.status).toEqual("pending")
    const second = await settlement.checkWithdrawal("po_spec_crypto")
    expect(second.status).toEqual("confirmed")
    expect(second.tx_hash).toEqual("0xmockoutpo_spec_crypto")
  })

  it("fails a withdrawal to an address containing 'fail'", async () => {
    await settlement.createWithdrawal({
      reference: "po_spec_crypto_bad",
      address: "0xfail0000000000000000000000000000000000ff",
      usdc_amount: "1.00",
    })
    const checked = await settlement.checkWithdrawal("po_spec_crypto_bad")
    expect(checked.status).toEqual("failed")
  })

  it("keeps deposit intents isolated and threads expected_usdc through (correlation fix)", async () => {
    const a = await settlement.createDepositIntent({
      reference: "dep_spec_a",
      usdc_amount: "10.00",
    })
    const b = await settlement.createDepositIntent({
      reference: "dep_spec_b",
      usdc_amount: "20.00",
    })

    // per-intent addresses + wallets — never a shared network wallet
    expect(a.address).not.toEqual(b.address)
    expect(a.wallet_id).not.toEqual(b.wallet_id)
    expect(a.wallet_id).toEqual("mock-wallet-dep_spec_a")

    // confirming A must not confirm B, and A reports its own amount
    await settlement.checkSettlement({
      reference: a.reference,
      wallet_id: a.wallet_id,
      expected_usdc: a.usdc_amount,
    })
    const aDone = await settlement.checkSettlement({
      reference: a.reference,
      wallet_id: a.wallet_id,
      expected_usdc: a.usdc_amount,
    })
    expect(aDone.status).toEqual("confirmed")
    expect(aDone.usdc_received).toEqual("10.00")

    const bFirst = await settlement.checkSettlement({
      reference: b.reference,
      wallet_id: b.wallet_id,
      expected_usdc: b.usdc_amount,
    })
    expect(bFirst.status).toEqual("pending")
  })
})

/**
 * In-app: the settlement ledger, the create-payout workflow (through the real
 * seller API), the transfer webhook, reconcile and reversals — all against a
 * freshly migrated DB with mock rails.
 */
medusaIntegrationTestRunner({
  inApp: true,
  env: {},
  testSuite: ({ api, getContainer, dbUtils }) => {
    describe("Payouts — in-app settlement & payout lifecycle", () => {
      let marketplace: MarketplaceModuleService
      let token: string
      let sellerId: string

      const auth = () => ({ headers: { Authorization: `Bearer ${token}` } })

      const seedLine = async (
        orderId: string,
        net: number,
        status: "pending" | "available" | "paid" = "pending"
      ) =>
        marketplace.createCommissionLines({
          order_id: orderId,
          currency_code: "ngn",
          order_total: net / 0.95,
          rate: 0.05,
          commission_amount: net / 0.95 - net,
          net_amount: net,
          status,
          ...(status !== "pending" ? { available_at: new Date() } : {}),
          seller_id: sellerId,
        })

      beforeAll(async () => {
        marketplace = getContainer().resolve(MARKETPLACE_MODULE)

        const register = await api.post("/auth/seller/emailpass/register", {
          email: "payout-seller@howsu.local",
          password: "supersecret",
        })
        const created = await api.post(
          "/sellers",
          {
            name: "Payout Seller",
            handle: "payout-seller",
            admin: {
              email: "payout-seller@howsu.local",
              first_name: "Payout",
              last_name: "Seller",
            },
          },
          { headers: { Authorization: `Bearer ${register.data.token}` } }
        )
        sellerId = created.data.seller.id

        const login = await api.post("/auth/seller/emailpass", {
          email: "payout-seller@howsu.local",
          password: "supersecret",
        })
        token = login.data.token

        // default verified destinations for both rails
        const bank = await api.post(
          "/sellers/payout-accounts",
          { type: "bank_account", bank_code: "058", account_number: "0123456789" },
          auth()
        )
        expect(bank.status).toEqual(201)
        expect(bank.data.payout_account.account_name).toEqual(
          "MOCK ACCOUNT 6789"
        )
        expect(bank.data.payout_account.recipient_code).toEqual(
          "RCP_mock_0123456789"
        )
        expect(bank.data.payout_account.status).toEqual("verified")

        const cryptoAcct = await api.post(
          "/sellers/payout-accounts",
          {
            type: "crypto_address",
            network: "base",
            address: "0x1111222233334444555566667777888899990000",
          },
          auth()
        )
        expect(cryptoAcct.status).toEqual(201)

        // the runner restores the DB from a template before every test —
        // snapshot so the onboarded seller + accounts survive into each one
        await dbUtils.snapshot()
      })

      it("rejects a bank account whose name-resolve fails — nothing stored", async () => {
        await expect(
          api.post(
            "/sellers/payout-accounts",
            { type: "bank_account", bank_code: "058", account_number: "0011223344" },
            auth()
          )
        ).rejects.toMatchObject({ response: { status: 400 } })

        const accounts = await marketplace.listPayoutAccounts({
          seller_id: sellerId,
          account_number: "0011223344",
        })
        expect(accounts).toHaveLength(0)
      })

      it("clears pending lines and sums the balance per status bucket", async () => {
        await seedLine("order_bal_1", 7000, "pending")
        await seedLine("order_bal_2", 3000, "pending")
        await seedLine("order_bal_3", 2000, "paid")

        const res = await api.get("/sellers/balance", auth())
        expect(res.status).toEqual(200)
        // fallback release 0 → the balance route's releaseDueLines() flips
        // both pending lines to available on the way in
        expect(res.data.balances.ngn).toEqual({
          pending: 0,
          available: 10000,
          reserved: 0,
          paid_out: 2000,
        })
        expect(res.data.minimum_ngn).toEqual(1)
      })

      it("creates a processing paystack payout, reserves lines, and replays idempotently", async () => {
        await seedLine("order_po_1", 7000)
        await seedLine("order_po_2", 3000)

        const res = await api.post(
          "/sellers/payouts",
          { rail: "paystack", idempotency_key: "spec-po-1" },
          auth()
        )
        const payout = res.data.payout
        expect(payout.status).toEqual("processing")
        expect(payout.amount).toEqual(10000)
        expect(payout.provider_reference).toEqual(`TRF_mock_${payout.id}`)
        expect(payout.destination.recipient_code).toEqual(
          "RCP_mock_0123456789"
        )

        // full available balance swept into `reserved`, stamped with the payout
        const reserved = await marketplace.listCommissionLines({
          seller_id: sellerId,
          status: "reserved",
        })
        expect(reserved).toHaveLength(2)
        for (const line of reserved) {
          expect(line.payout_id).toEqual(payout.id)
        }

        // replaying the same idempotency key returns the SAME payout — one row
        const replay = await api.post(
          "/sellers/payouts",
          { rail: "paystack", idempotency_key: "spec-po-1" },
          auth()
        )
        expect(replay.data.payout.id).toEqual(payout.id)
        const rows = await marketplace.listPayouts({ seller_id: sellerId })
        expect(rows).toHaveLength(1)
      })

      it("rejects a below-minimum payout and reserves nothing", async () => {
        await seedLine("order_small", 500)

        const prevMin = process.env.PAYOUT_MIN_NGN
        process.env.PAYOUT_MIN_NGN = "100000"
        try {
          await expect(
            api.post(
              "/sellers/payouts",
              { rail: "paystack", idempotency_key: "spec-po-small" },
              auth()
            )
          ).rejects.toMatchObject({
            response: { status: expect.any(Number) },
          })
        } finally {
          process.env.PAYOUT_MIN_NGN = prevMin
        }

        // compensation left zero payout rows and the line still available
        expect(await marketplace.listPayouts({ seller_id: sellerId })).toHaveLength(0)
        const lines = await marketplace.listCommissionLines({
          seller_id: sellerId,
          order_id: "order_small",
        })
        expect(lines[0].status).toEqual("available")
        expect(lines[0].payout_id).toBeNull()
      })

      it("webhook transfer.success flips the payout and its lines to paid", async () => {
        await seedLine("order_hook_ok", 10000)
        const { data } = await api.post(
          "/sellers/payouts",
          { rail: "paystack", idempotency_key: "spec-po-hook" },
          auth()
        )

        const hook = await api.post("/hooks/payouts/paystack", {
          event: "transfer.success",
          data: { reference: data.payout.id },
        })
        expect(hook.status).toEqual(200)
        expect(hook.data.received).toBe(true)

        const paidPayout = await marketplace.retrievePayout(data.payout.id)
        expect(paidPayout.status).toEqual("paid")
        expect(paidPayout.paid_at).toBeTruthy()

        const lines = await marketplace.listCommissionLines({
          seller_id: sellerId,
          order_id: "order_hook_ok",
        })
        expect(lines[0].status).toEqual("paid")

        const balance = await api.get("/sellers/balance", auth())
        expect(balance.data.balances.ngn.paid_out).toEqual(10000)
        expect(balance.data.balances.ngn.reserved).toEqual(0)
      })

      it("webhook transfer.failed fails the payout and releases the lines", async () => {
        await seedLine("order_hook_bad", 10000)
        const { data } = await api.post(
          "/sellers/payouts",
          { rail: "paystack", idempotency_key: "spec-po-hookfail" },
          auth()
        )

        const hook = await api.post("/hooks/payouts/paystack", {
          event: "transfer.failed",
          data: { reference: data.payout.id, reason: "insufficient balance" },
        })
        expect(hook.status).toEqual(200)

        const failed = await marketplace.retrievePayout(data.payout.id)
        expect(failed.status).toEqual("failed")
        expect(failed.failure_reason).toEqual("insufficient balance")

        const lines = await marketplace.listCommissionLines({
          seller_id: sellerId,
          order_id: "order_hook_bad",
        })
        expect(lines[0].status).toEqual("available")
        expect(lines[0].payout_id).toBeNull()
      })

      it("acks unknown webhook events and unknown references without touching state", async () => {
        const unknownEvent = await api.post("/hooks/payouts/paystack", {
          event: "transfer.on_hold",
          data: { reference: "po_whatever" },
        })
        expect(unknownEvent.status).toEqual(200)

        const unknownRef = await api.post("/hooks/payouts/paystack", {
          event: "transfer.success",
          data: { reference: "po_does_not_exist" },
        })
        expect(unknownRef.status).toEqual(200)
        expect(unknownRef.data.received).toBe(true)
      })

      it("reconciles a processing crypto payout to paid after two polls", async () => {
        await seedLine("order_crypto", 8000)
        const { data } = await api.post(
          "/sellers/payouts",
          { rail: "crypto-usdc", idempotency_key: "spec-po-crypto" },
          auth()
        )
        expect(data.payout.status).toEqual("processing")
        // crypto rail: the provider reference is the payout id itself
        expect(data.payout.provider_reference).toEqual(data.payout.id)

        const first = await reconcilePayout(getContainer(), data.payout.id)
        expect(first.status).toEqual("processing")

        const second = await reconcilePayout(getContainer(), data.payout.id)
        expect(second.status).toEqual("paid")
        expect(Number(second.attempts)).toBeGreaterThanOrEqual(3)

        const lines = await marketplace.listCommissionLines({
          seller_id: sellerId,
          order_id: "order_crypto",
        })
        expect(lines[0].status).toEqual("paid")
      })

      it("reverses an unpaid order out of the balance", async () => {
        await seedLine("order_rev_unpaid", 4000, "available")

        const reversed = await marketplace.reverseCommissionForOrder(
          "order_rev_unpaid",
          "buyer refunded before payout"
        )
        expect(reversed.status).toEqual("reversed")
        expect(reversed.reversal_reason).toEqual("buyer refunded before payout")

        const balances = await marketplace.getSellerBalance(sellerId)
        expect(balances.ngn?.available ?? 0).toEqual(0)
      })

      it("reverses a paid order via a negated offset line that nets the balance down", async () => {
        await seedLine("order_rev_paid", 6000, "paid")

        const offset = await marketplace.reverseCommissionForOrder(
          "order_rev_paid",
          "chargeback after payout"
        )
        expect(offset.order_id).toEqual("order_rev_paid:reversal")
        expect(Number(offset.net_amount)).toEqual(-6000)
        expect(offset.status).toEqual("available")

        const balances = await marketplace.getSellerBalance(sellerId)
        expect(balances.ngn.available).toEqual(-6000)
        expect(balances.ngn.paid_out).toEqual(6000)

        // replaying the reversal is idempotent — same offset line, no double
        const again = await marketplace.reverseCommissionForOrder(
          "order_rev_paid",
          "chargeback after payout"
        )
        expect(again.id).toEqual(offset.id)
      })

      it("keeps /health 200 and the three payment providers enabled (no regression)", async () => {
        const health = await api.get("/health")
        expect(health.status).toEqual(200)

        const paymentService = getContainer().resolve(Modules.PAYMENT)
        const providers = await paymentService.listPaymentProviders({})
        const ids = providers.map((p: any) => p.id)
        expect(ids).toEqual(
          expect.arrayContaining([PAYSTACK_ID, FLUTTERWAVE_ID, CRYPTO_USDC_ID])
        )
      })
    })
  },
})

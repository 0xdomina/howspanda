import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
import { Modules } from "@medusajs/framework/utils"
import { BUYER_WALLET_MODULE } from "../../src/modules/buyer-wallet"
import BuyerWalletModuleService from "../../src/modules/buyer-wallet/service"
import { reconcileBuyerWithdrawal } from "../../src/lib/payments/payouts/reconcile"

jest.setTimeout(240 * 1000)

// Deterministic offline mock rails; a ₦1 minimum so test withdrawals are
// allowed immediately.
process.env.PAYSTACK_SECRET_KEY = "mock"
process.env.CIRCLE_API_KEY = "mock"
process.env.CRYPTO_ENABLED = "true"
process.env.WALLET_WITHDRAW_MIN_NGN = "1"
process.env.PAYOUT_SCHEDULE_ENABLED = "false"

medusaIntegrationTestRunner({
  inApp: true,
  env: {},
  testSuite: ({ api, getContainer, dbUtils }) => {
    describe("Buyer wallet — withdrawal rail (Phase 15)", () => {
      let buyerWallet: BuyerWalletModuleService
      let storeHeaders: { headers: Record<string, string> }

      const EMAIL = "buyer-wallet@howsu.local"

      beforeAll(async () => {
        buyerWallet = getContainer().resolve(BUYER_WALLET_MODULE)

        const apiKeyModule = getContainer().resolve(Modules.API_KEY)
        const [pubKey] = await apiKeyModule.createApiKeys([
          { title: "wallet-spec", type: "publishable", created_by: "wallet-spec" },
        ])
        storeHeaders = { headers: { "x-publishable-api-key": pubKey.token } }

        // The /store/wallet money routes require an authenticated customer
        // (email is resolved from the JWT actor, never the request). Sign up
        // the spec's buyer so storeHeaders carries a valid bearer token.
        const register = await api.post("/auth/customer/emailpass/register", {
          email: EMAIL,
          password: "supersecret",
        })
        expect(register.status).toEqual(200)
        expect(register.data.token).toBeTruthy()

        const created = await api.post(
          "/store/customers",
          { email: EMAIL, first_name: "Wallet", last_name: "Spec" },
          {
            headers: {
              authorization: `Bearer ${register.data.token}`,
              ...storeHeaders.headers,
            },
          }
        )
        expect(created.status).toEqual(200)

        const login = await api.post("/auth/customer/emailpass", {
          email: EMAIL,
          password: "supersecret",
        })
        expect(login.status).toEqual(200)
        expect(login.data.token).toBeTruthy()
        storeHeaders = {
          headers: {
            "x-publishable-api-key": pubKey.token,
            authorization: `Bearer ${login.data.token}`,
          },
        }

        // seed a real balance + verified destinations in beforeAll, then
        // snapshot so every test starts from this state (25k balance, both
        // rails have a default verified account)
        await buyerWallet.credit({
          buyerEmail: EMAIL,
          amount: 25_000,
          source: "mall_prize",
          reference: "wallet-spec-seed",
        })

        const bank = await api.post(
          "/store/wallet/withdrawal-accounts",
          {
            type: "bank_account",
            bank_code: "058",
            account_number: "0123456789",
          },
          storeHeaders
        )
        expect(bank.status).toEqual(201)
        expect(bank.data.withdrawal_account.account_name).toEqual(
          "MOCK ACCOUNT 6789"
        )
        expect(bank.data.withdrawal_account.recipient_code).toEqual(
          "RCP_mock_0123456789"
        )
        expect(bank.data.withdrawal_account.status).toEqual("verified")
        expect(bank.data.withdrawal_account.is_default).toBe(true)

        const crypto = await api.post(
          "/store/wallet/withdrawal-accounts",
          {
            type: "crypto_address",
            network: "base",
            address: "0x1111222233334444555566667777888899990000",
          },
          storeHeaders
        )
        expect(crypto.status).toEqual(201)

        await dbUtils.snapshot()
      })

      it("reports balance, minimum and ledger for a seeded wallet", async () => {
        const res = await api.get(
          `/store/wallet`,
          storeHeaders
        )
        expect(res.status).toEqual(200)
        expect(res.data.balance).toEqual(25_000)
        expect(res.data.minimum_ngn).toEqual(1)
        expect(res.data.ledger).toHaveLength(1)
        expect(res.data.ledger[0].source).toEqual("mall_prize")
      })

      it("lists the buyer's withdrawal accounts", async () => {
        const list = await api.get(
          `/store/wallet/withdrawal-accounts`,
          storeHeaders
        )
        expect(list.status).toEqual(200)
        expect(list.data.withdrawal_accounts).toHaveLength(2)
      })

      it("rejects a bank account whose name-resolve fails — nothing stored", async () => {
        await expect(
          api.post(
            "/store/wallet/withdrawal-accounts",
            {
              type: "bank_account",
              bank_code: "058",
              account_number: "0011223344",
            },
            storeHeaders
          )
        ).rejects.toMatchObject({ response: { status: 400 } })

        const accounts = await buyerWallet.listBuyerWithdrawalAccounts({
          buyer_email: EMAIL,
          account_number: "0011223344",
        })
        expect(accounts).toHaveLength(0)
      })

      it("creates a processing paystack withdrawal, debits the wallet, and replays idempotently", async () => {
        const res = await api.post(
          "/store/wallet/withdrawals",
          {
            rail: "paystack",
            amount: 10_000,
            idempotency_key: "spec-bw-1",
          },
          storeHeaders
        )
        const withdrawal = res.data.withdrawal
        expect(withdrawal.status).toEqual("processing")
        expect(withdrawal.amount).toEqual(10_000)
        expect(withdrawal.provider_reference).toEqual(`TRF_mock_${withdrawal.id}`)
        expect(withdrawal.destination.recipient_code).toEqual(
          "RCP_mock_0123456789"
        )
        expect(withdrawal.id.startsWith("bw_")).toBe(true)

        // the money left the buyer-visible balance
        const wallet = await api.get(
          `/store/wallet`,
          storeHeaders
        )
        expect(wallet.data.balance).toEqual(15_000)

        // ledger shows the withdrawal line referencing the withdrawal id
        const withdrawalLine = wallet.data.ledger.find(
          (l: any) => l.source === "withdrawal"
        )
        expect(withdrawalLine).toBeTruthy()
        expect(withdrawalLine.reference).toEqual(withdrawal.id)

        // replaying the same idempotency key returns the SAME withdrawal
        const replay = await api.post(
          "/store/wallet/withdrawals",
          {
            rail: "paystack",
            amount: 10_000,
            idempotency_key: "spec-bw-1",
          },
          storeHeaders
        )
        expect(replay.data.withdrawal.id).toEqual(withdrawal.id)
        const rows = await buyerWallet.listBuyerWithdrawals({
          wallet: withdrawal.wallet_id,
        })
        expect(rows).toHaveLength(1)
      })

      it("rejects a below-minimum withdrawal and leaves balance untouched", async () => {
        const before = await buyerWallet.balance(EMAIL)

        await expect(
          api.post(
            "/store/wallet/withdrawals",
            {
              rail: "paystack",
              amount: 0.5,
              idempotency_key: "spec-bw-small",
            },
            storeHeaders
          )
        ).rejects.toMatchObject({
          response: { status: expect.any(Number) },
        })

        // compensation left zero withdrawal rows and the balance unchanged
        expect(await buyerWallet.balance(EMAIL)).toEqual(before)
        expect(
          await buyerWallet.listBuyerWithdrawals({
            idempotency_key: "spec-bw-small",
          })
        ).toHaveLength(0)
      })

      it("rejects a withdrawal above the balance — nothing debited", async () => {
        const before = await buyerWallet.balance(EMAIL)

        await expect(
          api.post(
            "/store/wallet/withdrawals",
            {
              rail: "paystack",
              amount: 1_000_000,
              idempotency_key: "spec-bw-over",
            },
            storeHeaders
          )
        ).rejects.toMatchObject({
          response: { status: expect.any(Number) },
        })

        expect(await buyerWallet.balance(EMAIL)).toEqual(before)
        expect(
          await buyerWallet.listBuyerWithdrawals({
            idempotency_key: "spec-bw-over",
          })
        ).toHaveLength(0)
      })

      it("webhook transfer.success flips the withdrawal to paid (balance stays debited)", async () => {
        const { data } = await api.post(
          "/store/wallet/withdrawals",
          {
            rail: "paystack",
            amount: 4_000,
            idempotency_key: "spec-bw-hook",
          },
          storeHeaders
        )

        const before = await buyerWallet.balance(EMAIL)
        expect(before).toEqual(21_000) // 25k - 4k

        const hook = await api.post(
          "/hooks/payouts/paystack",
          { event: "transfer.success", data: { reference: data.withdrawal.id } },
          storeHeaders
        )
        expect(hook.status).toEqual(200)
        expect(hook.data.received).toBe(true)

        const paid = await buyerWallet.retrieveBuyerWithdrawal(
          data.withdrawal.id
        )
        expect(paid.status).toEqual("paid")
        expect(paid.paid_at).toBeTruthy()

        // paid does NOT credit back — the money already left at request time
        expect(await buyerWallet.balance(EMAIL)).toEqual(21_000)
      })

      it("webhook transfer.failed fails the withdrawal and credits the balance back", async () => {
        const { data } = await api.post(
          "/store/wallet/withdrawals",
          {
            rail: "paystack",
            amount: 3_000,
            idempotency_key: "spec-bw-hookfail",
          },
          storeHeaders
        )

        const before = await buyerWallet.balance(EMAIL)
        expect(before).toEqual(22_000) // 25k - 3k

        const hook = await api.post(
          "/hooks/payouts/paystack",
          {
            event: "transfer.failed",
            data: {
              reference: data.withdrawal.id,
              reason: "insufficient balance",
            },
          },
          storeHeaders
        )
        expect(hook.status).toEqual(200)

        const failed = await buyerWallet.retrieveBuyerWithdrawal(
          data.withdrawal.id
        )
        expect(failed.status).toEqual("failed")
        expect(failed.failure_reason).toEqual("insufficient balance")

        // failed credits the amount back into the wallet
        expect(await buyerWallet.balance(EMAIL)).toEqual(25_000)

        // replaying the failed verdict is idempotent — no double credit
        const again = await api.post(
          "/hooks/payouts/paystack",
          {
            event: "transfer.failed",
            data: {
              reference: data.withdrawal.id,
              reason: "insufficient balance",
            },
          },
          storeHeaders
        )
        expect(again.status).toEqual(200)
        expect(await buyerWallet.balance(EMAIL)).toEqual(25_000)
      })

      it("reconciles a processing crypto withdrawal to paid after two polls", async () => {
        const { data } = await api.post(
          "/store/wallet/withdrawals",
          {
            rail: "crypto-usdc",
            amount: 5_000,
            idempotency_key: "spec-bw-crypto",
          },
          storeHeaders
        )
        expect(data.withdrawal.status).toEqual("processing")
        // crypto rail: the provider reference is the withdrawal id itself
        expect(data.withdrawal.provider_reference).toEqual(data.withdrawal.id)

        const first = await reconcileBuyerWithdrawal(
          getContainer(),
          data.withdrawal.id
        )
        expect(first.status).toEqual("processing")

        const second = await reconcileBuyerWithdrawal(
          getContainer(),
          data.withdrawal.id
        )
        expect(second.status).toEqual("paid")
        expect(Number(second.attempts)).toBeGreaterThanOrEqual(3)

        // paid — the debited amount stays out of the balance
        expect(await buyerWallet.balance(EMAIL)).toEqual(20_000) // 25k - 5k
      })

      it("acks ignored events and unknown references with 200 (permanent)", async () => {
        const ignored = await api.post(
          "/hooks/payouts/paystack",
          { event: "transfer.on_hold", data: { reference: "bw_whatever" } },
          storeHeaders
        )
        expect(ignored.status).toEqual(200)
        expect(ignored.data.received).toBe(true)

        const unknownRef = await api.post(
          "/hooks/payouts/paystack",
          {
            event: "transfer.success",
            data: { reference: "bw_does_not_exist" },
          },
          storeHeaders
        )
        expect(unknownRef.status).toEqual(200)
        expect(unknownRef.data.received).toBe(true)
      })

      it("rejects an invalid signature with 401 in live mode", async () => {
        // mock mode skips signature checks — flip to live for this one test
        const prev = process.env.PAYSTACK_SECRET_KEY
        process.env.PAYSTACK_SECRET_KEY = "live-secret"
        try {
          await expect(
            api.post(
              "/hooks/payouts/paystack",
              {
                event: "transfer.success",
                data: { reference: "bw_whatever" },
              },
              storeHeaders
            )
          ).rejects.toMatchObject({ response: { status: 401 } })
        } finally {
          process.env.PAYSTACK_SECRET_KEY = prev
        }
      })

      it("returns 500 on a transient processing failure so the gateway retries", async () => {
        const spy = jest
          .spyOn(buyerWallet, "markBuyerWithdrawalPaid")
          .mockRejectedValue(new Error("db connection lost"))

        try {
          await expect(
            api.post(
              "/hooks/payouts/paystack",
              {
                event: "transfer.success",
                data: { reference: "bw_whatever" },
              },
              storeHeaders
            )
          ).rejects.toMatchObject({
            response: { status: 500 },
          })
        } finally {
          spy.mockRestore()
        }
      })

      it("redelivered verdicts are idempotent — a second transfer.success is a safe no-op", async () => {
        const { data } = await api.post(
          "/store/wallet/withdrawals",
          {
            rail: "paystack",
            amount: 2_000,
            idempotency_key: "spec-bw-redeliver",
          },
          storeHeaders
        )
        const withdrawalId = data.withdrawal.id

        const first = await api.post(
          "/hooks/payouts/paystack",
          { event: "transfer.success", data: { reference: withdrawalId } },
          storeHeaders
        )
        expect(first.status).toEqual(200)

        // Paystack redelivers on timeout — the second delivery must be a no-op
        const second = await api.post(
          "/hooks/payouts/paystack",
          { event: "transfer.success", data: { reference: withdrawalId } },
          storeHeaders
        )
        expect(second.status).toEqual(200)

        const paid = await buyerWallet.retrieveBuyerWithdrawal(withdrawalId)
        expect(paid.status).toEqual("paid")
        expect(await buyerWallet.balance(EMAIL)).toEqual(23_000) // 25k - 2k
      })
    })
  },
})

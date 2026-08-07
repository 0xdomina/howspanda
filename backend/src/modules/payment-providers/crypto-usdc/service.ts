import { randomUUID } from "node:crypto"
import { AbstractPaymentProvider, MedusaError } from "@medusajs/framework/utils"
import {
  AuthorizePaymentInput,
  AuthorizePaymentOutput,
  CancelPaymentInput,
  CancelPaymentOutput,
  CapturePaymentInput,
  CapturePaymentOutput,
  DeletePaymentInput,
  DeletePaymentOutput,
  GetPaymentStatusInput,
  GetPaymentStatusOutput,
  InitiatePaymentInput,
  InitiatePaymentOutput,
  PaymentSessionStatus,
  ProviderWebhookPayload,
  RefundPaymentInput,
  RefundPaymentOutput,
  RetrievePaymentInput,
  RetrievePaymentOutput,
  UpdatePaymentInput,
  UpdatePaymentOutput,
  WebhookActionResult,
} from "@medusajs/framework/types"
import {
  getCryptoSettlement,
  isCryptoEnabled,
  quoteUsdc,
} from "../../../lib/payments/crypto"

export type CryptoUsdcOptions = {
  enabled?: string
  defaultNetwork?: string
  networkEnv?: string
  circleApiKey?: string
}

/**
 * Network-agnostic USDC settlement provider (testnet PoC).
 *
 * Mock mode (default): CIRCLE_API_KEY absent/"mock" → deterministic offline
 * deposit intents, no chain calls. Settlement is polled via authorizePayment
 * (pending_authorization → authorized), so no webhook is needed for the PoC.
 * The network (base/solana) and testnet↔mainnet switch are pure env config.
 */
class CryptoUsdcProviderService extends AbstractPaymentProvider<CryptoUsdcOptions> {
  static identifier = "crypto-usdc"

  protected options_: CryptoUsdcOptions

  constructor(container: Record<string, unknown>, options: CryptoUsdcOptions) {
    super(container, options)
    this.options_ = options ?? {}
  }

  static validateOptions(options: Record<any, any>): void {
    if (options?.circleApiKey && typeof options.circleApiKey !== "string") {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "crypto-usdc provider: circleApiKey must be a string"
      )
    }
  }

  async initiatePayment(
    input: InitiatePaymentInput
  ): Promise<InitiatePaymentOutput> {
    if (!isCryptoEnabled()) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "USDC rail is disabled"
      )
    }
    const amount = Number(input.amount)
    const reference =
      input.context?.idempotency_key ?? `cr_${randomUUID().replace(/-/g, "")}`

    const settlement = getCryptoSettlement()
    // Session amount is kobo (minor unit); quoteUsdc expects naira (major).
    const usdcAmount = quoteUsdc(amount / 100)
    const intent = await settlement.createDepositIntent({
      reference,
      usdc_amount: usdcAmount,
    })

    return {
      id: reference,
      status: "pending",
      data: {
        provider: "crypto-usdc",
        reference,
        network: intent.network,
        env: intent.env,
        address: intent.address,
        wallet_id: intent.wallet_id,
        usdc_amount: intent.usdc_amount,
        expires_at: intent.expires_at,
        amount,
        currency_code: input.currency_code,
      },
    }
  }

  protected async settlementStatus(
    data: Record<string, any> | undefined
  ): Promise<{ status: PaymentSessionStatus; raw: Record<string, any> }> {
    const reference = data?.reference as string | undefined
    if (!reference) {
      return { status: "pending_authorization", raw: {} }
    }

    const settlement = getCryptoSettlement(data?.network as string | undefined)
    // wallet_id + expected_usdc scope the check to THIS intent's deposit
    // wallet (correlation fix) — both stored in session data since Phase 4.
    const result = await settlement.checkSettlement({
      reference,
      wallet_id: data?.wallet_id as string | undefined,
      expected_usdc: data?.usdc_amount as string | undefined,
    })

    let status: PaymentSessionStatus
    switch (result.status) {
      case "confirmed":
        status = "authorized"
        break
      case "failed":
        status = "error"
        break
      default:
        // Awaiting on-chain confirmation — Medusa keeps the order awaiting and
        // re-checks later.
        status = "pending_authorization"
    }

    return { status, raw: result as unknown as Record<string, any> }
  }

  async authorizePayment(
    input: AuthorizePaymentInput
  ): Promise<AuthorizePaymentOutput> {
    const { status, raw } = await this.settlementStatus(input.data)
    return { status, data: { ...input.data, settlement: raw, status } }
  }

  async getPaymentStatus(
    input: GetPaymentStatusInput
  ): Promise<GetPaymentStatusOutput> {
    const { status, raw } = await this.settlementStatus(input.data)
    return { status, data: { ...input.data, settlement: raw } }
  }

  async capturePayment(
    input: CapturePaymentInput
  ): Promise<CapturePaymentOutput> {
    // Confirmed on-chain settlement is final; mark captured.
    return { data: { ...input.data, captured: true } }
  }

  async cancelPayment(input: CancelPaymentInput): Promise<CancelPaymentOutput> {
    return { data: { ...input.data, status: "canceled" } }
  }

  async deletePayment(input: DeletePaymentInput): Promise<DeletePaymentOutput> {
    return { data: input.data }
  }

  async refundPayment(input: RefundPaymentInput): Promise<RefundPaymentOutput> {
    // On-chain refunds require an outbound transfer — deferred to a later phase
    // (payouts). Echo the requested amount so the ledger stays consistent.
    return {
      data: { ...input.data, refunded_amount: Number(input.amount) },
    }
  }

  async retrievePayment(
    input: RetrievePaymentInput
  ): Promise<RetrievePaymentOutput> {
    return { data: input.data }
  }

  async updatePayment(input: UpdatePaymentInput): Promise<UpdatePaymentOutput> {
    // Re-quote USDC if the cart amount changed before settlement.
    const amount = Number(input.amount)
    return {
      data: {
        ...input.data,
        amount,
        currency_code: input.currency_code,
        usdc_amount: quoteUsdc(amount / 100),
      },
    }
  }

  async getWebhookActionAndData(
    _payload: ProviderWebhookPayload["payload"]
  ): Promise<WebhookActionResult> {
    // PoC settles by polling authorizePayment, not webhooks.
    return { action: "not_supported" }
  }
}

export default CryptoUsdcProviderService

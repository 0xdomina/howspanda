import { randomUUID, timingSafeEqual } from "node:crypto"
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
import { getJson, postJson } from "../../../lib/payments/http"

const FLUTTERWAVE_API_BASE = "https://api.flutterwave.com/v3"

export type FlutterwaveOptions = {
  secretKey?: string
  publicKey?: string
  encryptionKey?: string
  /** Boot-time on/off from FLUTTERWAVE_ENABLED; the runtime toggle is the rails module. */
  enabled?: boolean
}

/**
 * Flutterwave payment provider (Nigeria-first, redirect gateway).
 *
 * Mock mode (default): secretKey absent, empty, or the literal "mock" —
 * deterministic, fully offline. Live mode calls the Flutterwave v3 REST API;
 * amounts are sent in major NGN units (no minor-unit conversion).
 */
class FlutterwaveProviderService extends AbstractPaymentProvider<FlutterwaveOptions> {
  static identifier = "flutterwave"

  protected options_: FlutterwaveOptions

  constructor(
    container: Record<string, unknown>,
    options: FlutterwaveOptions
  ) {
    super(container, options)
    this.options_ = options ?? {}
  }

  static validateOptions(options: Record<any, any>): void {
    // Mock mode (absent/empty/"mock" secret key) needs no validation; in live
    // mode the secret key is by definition present, so only guard the type.
    if (options?.secretKey && typeof options.secretKey !== "string") {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "Flutterwave provider: secretKey must be a string"
      )
    }
  }

  protected isMockMode(): boolean {
    const key = this.options_.secretKey
    return !key || key === "mock"
  }

  protected authHeaders(): Record<string, string> {
    return { Authorization: `Bearer ${this.options_.secretKey}` }
  }

  async initiatePayment(
    input: InitiatePaymentInput
  ): Promise<InitiatePaymentOutput> {
    if (this.options_.enabled === false) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "Flutterwave rail is disabled"
      )
    }
    const amount = Number(input.amount)
    const currencyCode = input.currency_code
    const txRef =
      input.context?.idempotency_key ?? `fw_${randomUUID().replace(/-/g, "")}`

    if (this.isMockMode()) {
      return {
        id: txRef,
        status: "pending",
        data: {
          provider: "flutterwave",
          reference: txRef,
          authorization_url: `https://mock.pay/flutterwave/${txRef}`,
          amount,
          currency_code: currencyCode,
          mock: true,
        },
      }
    }

    const response = await postJson(
      `${FLUTTERWAVE_API_BASE}/payments`,
      {
        tx_ref: txRef,
        // Flutterwave expects the major unit (NGN), while Medusa passes the
        // minor unit (kobo) — convert once here.
        amount: Math.round(amount / 100),
        currency: currencyCode.toUpperCase(),
        redirect_url: "https://mock.pay/flutterwave/redirect",
        customer: {
          email: input.context?.customer?.email ?? "guest@howsu.local",
        },
        meta: { session_id: input.data?.session_id ?? null },
      },
      this.authHeaders()
    )

    return {
      id: txRef,
      status: "pending",
      data: {
        provider: "flutterwave",
        reference: txRef,
        authorization_url: response.data?.link,
        amount,
        currency_code: currencyCode,
      },
    }
  }

  protected async verifyTransaction(
    transactionId: string | number
  ): Promise<{ status: PaymentSessionStatus; raw: Record<string, any> }> {
    const response = await getJson(
      `${FLUTTERWAVE_API_BASE}/transactions/${transactionId}/verify`,
      this.authHeaders()
    )
    const txStatus = response.data?.status

    let status: PaymentSessionStatus
    switch (txStatus) {
      case "successful":
        // Flutterwave auto-captures on successful charge
        status = "captured"
        break
      case "failed":
        status = "error"
        break
      case "pending":
      default:
        status = "pending"
    }

    return { status, raw: response.data ?? {} }
  }

  async authorizePayment(
    input: AuthorizePaymentInput
  ): Promise<AuthorizePaymentOutput> {
    if (this.isMockMode()) {
      return {
        status: "authorized",
        data: { ...input.data, status: "authorized" },
      }
    }

    // Verification requires the numeric transaction id delivered by the
    // webhook/redirect; until it arrives the payment stays pending.
    const transactionId = input.data?.transaction_id as
      | string
      | number
      | undefined
    if (!transactionId) {
      return { status: "pending", data: input.data }
    }

    const { status, raw } = await this.verifyTransaction(transactionId)
    return { status, data: { ...input.data, verification: raw, status } }
  }

  async capturePayment(
    input: CapturePaymentInput
  ): Promise<CapturePaymentOutput> {
    // Flutterwave auto-captures on successful charge; just mark the data.
    return { data: { ...input.data, captured: true } }
  }

  async cancelPayment(input: CancelPaymentInput): Promise<CancelPaymentOutput> {
    // Flutterwave has no cancel API for pending payment links; the hosted
    // page simply expires. Mark the session canceled locally.
    return { data: { ...input.data, status: "canceled" } }
  }

  async deletePayment(input: DeletePaymentInput): Promise<DeletePaymentOutput> {
    return { data: input.data }
  }

  async getPaymentStatus(
    input: GetPaymentStatusInput
  ): Promise<GetPaymentStatusOutput> {
    if (this.isMockMode()) {
      return { status: "authorized", data: input.data }
    }

    const transactionId = input.data?.transaction_id as
      | string
      | number
      | undefined
    if (!transactionId) {
      return { status: "pending", data: input.data }
    }

    const { status, raw } = await this.verifyTransaction(transactionId)
    return { status, data: { ...input.data, verification: raw } }
  }

  async refundPayment(input: RefundPaymentInput): Promise<RefundPaymentOutput> {
    const amount = Number(input.amount)

    if (this.isMockMode()) {
      return { data: { ...input.data, refunded_amount: amount } }
    }

    const transactionId = input.data?.transaction_id as
      | string
      | number
      | undefined
    if (!transactionId) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "Flutterwave provider: missing transaction_id in payment data"
      )
    }

    const response = await postJson(
      `${FLUTTERWAVE_API_BASE}/transactions/${transactionId}/refund`,
      // Flutterwave refund amounts are major units (NGN) — convert from kobo.
      { amount: Math.round(amount / 100) },
      this.authHeaders()
    )

    return {
      data: { ...input.data, refund: response.data, refunded_amount: amount },
    }
  }

  async retrievePayment(
    input: RetrievePaymentInput
  ): Promise<RetrievePaymentOutput> {
    if (this.isMockMode()) {
      return { data: input.data }
    }

    const transactionId = input.data?.transaction_id as
      | string
      | number
      | undefined
    if (!transactionId) {
      return { data: input.data }
    }

    const { raw } = await this.verifyTransaction(transactionId)
    return { data: { ...input.data, verification: raw } }
  }

  async updatePayment(input: UpdatePaymentInput): Promise<UpdatePaymentOutput> {
    // Flutterwave payment links are immutable; keep the session data in sync
    // with the latest cart amount for later re-initialization.
    return {
      data: {
        ...input.data,
        amount: Number(input.amount),
        currency_code: input.currency_code,
      },
    }
  }

  protected isValidWebhookHash(
    headers: ProviderWebhookPayload["payload"]["headers"]
  ): boolean {
    // Flutterwave sends the configured secret hash verbatim in `verif-hash`;
    // fall back to the secret key when no dedicated hash is configured.
    const expected = this.options_.encryptionKey || this.options_.secretKey
    const received = headers?.["verif-hash"]
    if (!expected || !received || typeof received !== "string") {
      return false
    }

    const a = Buffer.from(expected)
    const b = Buffer.from(received)
    return a.length === b.length && timingSafeEqual(a, b)
  }

  async getWebhookActionAndData(
    payload: ProviderWebhookPayload["payload"]
  ): Promise<WebhookActionResult> {
    const data = (payload.data ?? {}) as Record<string, any>

    if (this.isMockMode()) {
      // Mock mode reads { session_id, amount, event } directly from the body.
      const event = String(data.event ?? "")
      const isSuccess = ["success", "charge.success", "successful"].includes(
        event
      )
      return {
        action: isSuccess ? "captured" : "failed",
        data: {
          session_id: String(data.session_id ?? ""),
          amount: Number(data.amount ?? 0),
        },
      }
    }

    if (!this.isValidWebhookHash(payload.headers)) {
      return { action: "not_supported" }
    }

    const event = String(data.event ?? "")
    const tx = (data.data ?? {}) as Record<string, any>
    const sessionId = tx.meta?.session_id ?? tx.tx_ref ?? ""
    // Flutterwave webhook amounts are major units (NGN) — normalize to the
    // minor unit (kobo) the session uses.
    const amount = Math.round(Number(tx.amount ?? 0) * 100)

    if (event === "charge.completed" && tx.status === "successful") {
      return {
        action: "captured",
        data: { session_id: String(sessionId), amount },
      }
    }

    if (event === "charge.completed") {
      return {
        action: "failed",
        data: { session_id: String(sessionId), amount },
      }
    }

    return { action: "not_supported" }
  }
}

export default FlutterwaveProviderService

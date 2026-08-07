import { createHmac, randomUUID, timingSafeEqual } from "node:crypto"
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

const PAYSTACK_API_BASE = "https://api.paystack.co"

export type PaystackOptions = {
  secretKey?: string
  publicKey?: string
  /** Boot-time on/off from PAYSTACK_ENABLED; the runtime toggle is the rails module. */
  enabled?: boolean
}

/**
 * Paystack payment provider (Nigeria-first, redirect gateway).
 *
 * Mock mode (default): secretKey absent, empty, or the literal "mock" —
 * deterministic, fully offline. Live mode calls the Paystack REST API and
 * amounts are converted to kobo (NGN minor unit, x100).
 */
class PaystackProviderService extends AbstractPaymentProvider<PaystackOptions> {
  static identifier = "paystack"

  protected options_: PaystackOptions

  constructor(container: Record<string, unknown>, options: PaystackOptions) {
    super(container, options)
    this.options_ = options ?? {}
  }

  static validateOptions(options: Record<any, any>): void {
    // Mock mode (absent/empty/"mock" secret key) needs no validation; in live
    // mode the secret key is by definition present, so only guard the type.
    if (options?.secretKey && typeof options.secretKey !== "string") {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "Paystack provider: secretKey must be a string"
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
        "Paystack rail is disabled"
      )
    }
    const amount = Number(input.amount)
    const currencyCode = input.currency_code
    const reference =
      input.context?.idempotency_key ?? `ps_${randomUUID().replace(/-/g, "")}`

    if (this.isMockMode()) {
      return {
        id: reference,
        status: "pending",
        data: {
          provider: "paystack",
          reference,
          authorization_url: `https://mock.pay/paystack/${reference}`,
          amount,
          currency_code: currencyCode,
          mock: true,
        },
      }
    }

    const response = await postJson(
      `${PAYSTACK_API_BASE}/transaction/initialize`,
      {
        email: input.context?.customer?.email ?? "guest@howsu.local",
        // Paystack expects the minor unit (kobo), which is already what
        // Medusa passes in `input.amount` — do NOT scale it again.
        amount: Math.round(amount),
        currency: currencyCode.toUpperCase(),
        reference,
        metadata: { session_id: input.data?.session_id ?? null },
      },
      this.authHeaders()
    )

    return {
      id: reference,
      status: "pending",
      data: {
        provider: "paystack",
        reference,
        authorization_url: response.data?.authorization_url,
        access_code: response.data?.access_code,
        amount,
        currency_code: currencyCode,
      },
    }
  }

  protected async verifyTransaction(
    reference: string
  ): Promise<{ status: PaymentSessionStatus; raw: Record<string, any> }> {
    const response = await getJson(
      `${PAYSTACK_API_BASE}/transaction/verify/${reference}`,
      this.authHeaders()
    )
    const txStatus = response.data?.status

    let status: PaymentSessionStatus
    switch (txStatus) {
      case "success":
        // Paystack auto-captures on success
        status = "captured"
        break
      case "failed":
        status = "error"
        break
      case "abandoned":
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

    const reference = input.data?.reference as string | undefined
    if (!reference) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "Paystack provider: missing transaction reference in session data"
      )
    }

    const { status, raw } = await this.verifyTransaction(reference)
    return { status, data: { ...input.data, verification: raw, status } }
  }

  async capturePayment(
    input: CapturePaymentInput
  ): Promise<CapturePaymentOutput> {
    // Paystack auto-captures on successful charge; just mark the data.
    return { data: { ...input.data, captured: true } }
  }

  async cancelPayment(input: CancelPaymentInput): Promise<CancelPaymentOutput> {
    // Paystack has no cancel API for uncharged transactions; the hosted page
    // simply expires. Mark the session canceled locally.
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

    const reference = input.data?.reference as string | undefined
    if (!reference) {
      return { status: "pending", data: input.data }
    }

    const { status, raw } = await this.verifyTransaction(reference)
    return { status, data: { ...input.data, verification: raw } }
  }

  async refundPayment(input: RefundPaymentInput): Promise<RefundPaymentOutput> {
    const amount = Number(input.amount)

    if (this.isMockMode()) {
      return { data: { ...input.data, refunded_amount: amount } }
    }

    const reference = input.data?.reference as string | undefined
    if (!reference) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "Paystack provider: missing transaction reference in payment data"
      )
    }

    const response = await postJson(
      `${PAYSTACK_API_BASE}/refund`,
      {
        transaction: reference,
        // Refund amounts are kobo (minor unit), same as the session amount.
        amount: Math.round(amount),
      },
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

    const reference = input.data?.reference as string | undefined
    if (!reference) {
      return { data: input.data }
    }

    const { raw } = await this.verifyTransaction(reference)
    return { data: { ...input.data, verification: raw } }
  }

  async updatePayment(input: UpdatePaymentInput): Promise<UpdatePaymentOutput> {
    // Paystack transactions are immutable once initialized; keep the session
    // data in sync with the latest cart amount for later re-initialization.
    return {
      data: {
        ...input.data,
        amount: Number(input.amount),
        currency_code: input.currency_code,
      },
    }
  }

  protected isValidSignature(
    rawData: ProviderWebhookPayload["payload"]["rawData"],
    headers: ProviderWebhookPayload["payload"]["headers"],
    data: Record<string, unknown>
  ): boolean {
    const signature = headers?.["x-paystack-signature"]
    if (!signature || typeof signature !== "string") {
      return false
    }

    const body =
      typeof rawData === "string"
        ? rawData
        : rawData
          ? Buffer.from(rawData as Uint8Array).toString("utf8")
          : JSON.stringify(data)

    const expected = createHmac("sha512", this.options_.secretKey!)
      .update(body)
      .digest("hex")

    const a = Buffer.from(expected)
    const b = Buffer.from(signature)
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

    if (!this.isValidSignature(payload.rawData, payload.headers, data)) {
      return { action: "not_supported" }
    }

    const event = String(data.event ?? "")
    const tx = (data.data ?? {}) as Record<string, any>
    const sessionId = tx.metadata?.session_id ?? tx.reference ?? ""
    // Paystack webhook amounts are already in kobo (minor unit).
    const amount = Number(tx.amount ?? 0)

    if (event === "charge.success") {
      return {
        action: "captured",
        data: { session_id: String(sessionId), amount },
      }
    }

    if (event === "charge.failed") {
      return {
        action: "failed",
        data: { session_id: String(sessionId), amount },
      }
    }

    return { action: "not_supported" }
  }
}

export default PaystackProviderService

import { getJson, postJson } from "../http"

const PAYSTACK_API_BASE = "https://api.paystack.co"

/**
 * Paystack Transfers client (money OUT — the mirror of the paystack payment
 * provider's money IN). Pure functions on top of lib/payments/http.ts.
 *
 * Mock mode (PAYSTACK_SECRET_KEY absent/empty/"mock") is deterministic and
 * fully offline, mirroring the crypto mock's module-level state:
 * - resolveAccount fails for account numbers starting with "00"
 * - verifyTransfer: first check "pending", later checks "success", and any
 *   reference containing "fail" verifies as "failed"
 */

export class PaystackTransferError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "PaystackTransferError"
  }
}

export type TransferVerification = {
  reference: string
  status: "pending" | "success" | "failed" | "reversed"
  failure_reason?: string
}

// Module-level state survives per-request re-imports (see crypto/mock.ts).
type MockTransfer = { checks: number }
const MOCK_TRANSFERS = new Map<string, MockTransfer>()

function secretKey(): string {
  return process.env.PAYSTACK_SECRET_KEY ?? ""
}

function isMockMode(): boolean {
  const key = secretKey()
  return !key || key === "mock"
}

function authHeaders(): Record<string, string> {
  return { Authorization: `Bearer ${secretKey()}` }
}

export async function resolveAccount(
  account_number: string,
  bank_code: string
): Promise<{ account_name: string }> {
  if (isMockMode()) {
    if (account_number.startsWith("00")) {
      throw new PaystackTransferError(
        "Could not resolve account name. Check parameters or try again."
      )
    }
    return { account_name: `MOCK ACCOUNT ${account_number.slice(-4)}` }
  }

  const response = await getJson(
    `${PAYSTACK_API_BASE}/bank/resolve?account_number=${encodeURIComponent(
      account_number
    )}&bank_code=${encodeURIComponent(bank_code)}`,
    authHeaders()
  )
  const accountName = response.data?.account_name
  if (!accountName) {
    throw new PaystackTransferError(
      String(response.message ?? "Could not resolve account name")
    )
  }
  return { account_name: String(accountName) }
}

export async function createRecipient(input: {
  name: string
  account_number: string
  bank_code: string
}): Promise<{ recipient_code: string }> {
  if (isMockMode()) {
    return { recipient_code: `RCP_mock_${input.account_number}` }
  }

  const response = await postJson(
    `${PAYSTACK_API_BASE}/transferrecipient`,
    {
      type: "nuban",
      name: input.name,
      account_number: input.account_number,
      bank_code: input.bank_code,
      currency: "NGN",
    },
    authHeaders()
  )
  const recipientCode = response.data?.recipient_code
  if (!recipientCode) {
    throw new PaystackTransferError(
      String(response.message ?? "Could not create transfer recipient")
    )
  }
  return { recipient_code: String(recipientCode) }
}

export async function initiateTransfer(input: {
  amount_major: number
  recipient_code: string
  reference: string
  reason?: string
}): Promise<{ transfer_code: string; status: string }> {
  if (isMockMode()) {
    if (!MOCK_TRANSFERS.has(input.reference)) {
      MOCK_TRANSFERS.set(input.reference, { checks: 0 })
    }
    return {
      transfer_code: `TRF_mock_${input.reference}`,
      status: "pending",
    }
  }

  const response = await postJson(
    `${PAYSTACK_API_BASE}/transfer`,
    {
      source: "balance",
      // Paystack expects the minor unit (kobo for NGN = NGN * 100)
      amount: Math.round(input.amount_major * 100),
      recipient: input.recipient_code,
      reference: input.reference,
      reason: input.reason ?? "How's u seller payout",
    },
    authHeaders()
  )
  const transferCode = response.data?.transfer_code
  if (!transferCode) {
    throw new PaystackTransferError(
      String(response.message ?? "Could not initiate transfer")
    )
  }
  return {
    transfer_code: String(transferCode),
    status: String(response.data?.status ?? "pending"),
  }
}

export async function verifyTransfer(
  reference: string
): Promise<TransferVerification> {
  if (isMockMode()) {
    if (reference.includes("fail")) {
      return {
        reference,
        status: "failed",
        failure_reason: "mock transfer failure",
      }
    }
    const entry = MOCK_TRANSFERS.get(reference) ?? { checks: 0 }
    entry.checks += 1
    MOCK_TRANSFERS.set(reference, entry)
    return { reference, status: entry.checks < 2 ? "pending" : "success" }
  }

  const response = await getJson(
    `${PAYSTACK_API_BASE}/transfer/verify/${encodeURIComponent(reference)}`,
    authHeaders()
  )
  const raw = String(response.data?.status ?? "pending")

  let status: TransferVerification["status"]
  switch (raw) {
    case "success":
      status = "success"
      break
    case "failed":
    case "abandoned":
      status = "failed"
      break
    case "reversed":
      status = "reversed"
      break
    default:
      // otp | pending | processing | queued and anything unknown
      status = "pending"
  }

  return {
    reference,
    status,
    failure_reason:
      status === "failed" ? String(response.data?.reason ?? raw) : undefined,
  }
}

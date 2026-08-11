"use server"

import { sdk } from "@lib/config"
import { MEDUSA_BACKEND_URL } from "@lib/config"

export type BankTransferBank = {
  bank_code?: string | null
  bank_name?: string | null
  account_number?: string | null
  account_name?: string | null
} | null

export type BankTransferTransfer = {
  id: string
  order_id: string
  seller_id: string
  seller?: { name?: string | null; handle?: string | null } | null
  reference: string
  status: "awaiting_proof" | "submitted" | "confirmed" | "rejected" | "expired"
  currency_code: string
  amount: number | null
  bank: BankTransferBank
  proof_url: string | null
  buyer_note: string | null
  rejection_note: string | null
  recheck_until: string | null
  submitted_at: string | null
  confirmed_at: string | null
  rejected_at: string | null
  expired_at: string | null
}

export type BankTransferResponse =
  | { order_id: string; transfers: BankTransferTransfer[] }
  | { success: false; error: string }

const toError = (err: any): string => {
  try {
    return err?.message ?? err?.toString() ?? "Something went wrong."
  } catch {
    return "Something went wrong."
  }
}

// Buyer view of their direct-to-seller bank transfer: the account to pay
// into, the narration reference, and the live proof status.
export const retrieveBankTransfer = async (
  orderId: string,
  email: string
): Promise<BankTransferResponse> => {
  try {
    const res = await sdk.client.fetch<{
      order_id: string
      transfers: BankTransferTransfer[]
    }>(
      `/store/orders/${orderId}/bank-transfer?email=${encodeURIComponent(email)}`,
      { method: "GET", cache: "no-store" }
    )
    return res
  } catch (err: any) {
    return { success: false, error: toError(err) }
  }
}

export const submitBankProof = async (
  orderId: string,
  body: {
    email: string
    reference: string
    proof_url?: string
    amount?: number
    note?: string
  }
): Promise<{ success: boolean; error: string | null; transfer?: BankTransferTransfer }> => {
  try {
    const res = await sdk.client.fetch<{ order_id: string; transfer: BankTransferTransfer }>(
      `/store/orders/${orderId}/bank-proof`,
      { method: "POST", body }
    )
    return { success: true, error: null, transfer: res.transfer }
  } catch (err: any) {
    return { success: false, error: toError(err) }
  }
}

const IMAGE_MAX_BYTES = 10 * 1024 * 1024

// Uploads the proof screenshot. Guest checkout has no session, so this hits
// the public /store/uploads endpoint; the image only becomes meaningful once
// bound to an order by submitBankProof (which verifies the email).
export const uploadBankProofImage = async (
  file: File
): Promise<{ url?: string; error?: string }> => {
  if (file.size > IMAGE_MAX_BYTES) {
    return { error: "File too large — max 10MB" }
  }
  try {
    const form = new FormData()
    form.append("file", file, file.name)
    const res = await fetch(`${MEDUSA_BACKEND_URL}/store/uploads`, {
      method: "POST",
      body: form,
    })
    if (!res.ok) {
      const text = await res.text().catch(() => "")
      return { error: text || `Upload failed (${res.status})` }
    }
    const data = (await res.json()) as { url?: string }
    return { url: data.url }
  } catch (error: any) {
    return { error: error?.message ?? "Upload failed." }
  }
}

"use server"

import { sdk } from "@lib/config"

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
const PROOF_EXTENSIONS: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
}

// Uploads the proof screenshot directly to the private B2 bucket from Vercel's
// presigned upload route. The returned `private://` URI only becomes meaningful
// once bound to an order by submitBankProof.
export const uploadBankProofImage = async (
  file: File
): Promise<{ url?: string; error?: string }> => {
  if (file.size > IMAGE_MAX_BYTES) {
    return { error: "File too large — max 10MB" }
  }
  const ext = PROOF_EXTENSIONS[file.type]
  if (!ext) {
    return { error: "Only PNG, JPEG, and WebP images are accepted." }
  }
  try {
    const prepared = await sdk.client.fetch<{
      key: string
      uploadUrl: string
    }>("/store/proof-upload/prepare", {
      method: "POST",
      body: { mime: file.type, size: file.size },
    })
    const uploaded = await fetch(prepared.uploadUrl, {
      method: "PUT",
      headers: { "content-type": file.type },
      body: await file.arrayBuffer(),
    })
    if (!uploaded.ok) return { error: "Proof upload failed. Please try again." }
    const completed = await sdk.client.fetch<{ url?: string }>(
      "/store/proof-upload/complete",
      {
        method: "POST",
        body: { key: prepared.key, size: file.size, mime: file.type },
      }
    )
    return completed.url ? { url: completed.url } : { error: "Proof upload could not be verified." }
  } catch (error: any) {
    return { error: error?.message ?? "Upload failed." }
  }
}

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

// Uploads the proof screenshot via presigned direct-to-B2: the browser PUTs
// straight to the private bucket, bypassing the API entirely — so Cloudflare's
// managed challenge on multipart POSTs to the backend never blocks a buyer.
// The returned `private://` URI only becomes meaningful once bound to an
// order by submitBankProof (which verifies the email).
export const uploadBankProofImage = async (
  file: File
): Promise<{ url?: string; error?: string }> => {
  if (file.size > IMAGE_MAX_BYTES) {
    return { error: "File too large — max 10MB" }
  }
  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    }
    const pk = process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY
    if (pk) headers["x-publishable-api-key"] = pk

    const prepare = await fetch(`${MEDUSA_BACKEND_URL}/store/uploads?kind=proof-prepare`, {
      method: "POST",
      headers,
      body: JSON.stringify({ mime: file.type, size: file.size }),
    })
    if (!prepare.ok) {
      const text = await prepare.text().catch(() => "")
      return { error: text || `Upload prepare failed (${prepare.status})` }
    }
    const { uploadUrl, key } = (await prepare.json()) as {
      uploadUrl: string
      key: string
    }

    const put = await fetch(uploadUrl, {
      method: "PUT",
      headers: { "Content-Type": file.type },
      body: file,
    })
    if (!put.ok) {
      return { error: `Upload failed (${put.status})` }
    }

    const complete = await fetch(`${MEDUSA_BACKEND_URL}/store/uploads?kind=proof-complete`, {
      method: "POST",
      headers,
      body: JSON.stringify({ key, size: file.size, mime: file.type }),
    })
    if (!complete.ok) {
      const text = await complete.text().catch(() => "")
      return { error: text || `Upload validation failed (${complete.status})` }
    }
    const data = (await complete.json()) as { url?: string }
    return { url: data.url }
  } catch (error: any) {
    return { error: error?.message ?? "Upload failed." }
  }
}

"use server"

import { sdk } from "@lib/config"
import { MEDUSA_BACKEND_URL } from "@lib/config"
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3"

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

function getPrivateS3Config() {
  const bucket = process.env.PRIVATE_S3_BUCKET
  const endpoint = process.env.PRIVATE_S3_ENDPOINT
  const region = process.env.PRIVATE_S3_REGION || "us-east-1"
  const accessKeyId = process.env.PRIVATE_S3_ACCESS_KEY_ID
  const secretAccessKey = process.env.PRIVATE_S3_SECRET_ACCESS_KEY
  const prefix = (process.env.PRIVATE_S3_PREFIX || "payment-proofs").replace(/^\/+|\/+$/g, "")
  if (!bucket || !endpoint || !accessKeyId || !secretAccessKey) return null
  return new S3Client({
    region,
    endpoint,
    forcePathStyle: true,
    credentials: { accessKeyId, secretAccessKey },
  })
}

// Uploads the proof screenshot directly to the private B2 bucket from Vercel's
// serverless function. Bypasses the PandaStack backend entirely — no Cloudflare
// challenge, no publishable key, no multipart. The returned `private://` URI
// only becomes meaningful once bound to an order by submitBankProof.
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
  const s3 = getPrivateS3Config()
  if (!s3) {
    return { error: "Proof storage is not configured." }
  }
  try {
    const prefix = (process.env.PRIVATE_S3_PREFIX || "payment-proofs").replace(/^\/+|\/+$/g, "")
    const bucket = process.env.PRIVATE_S3_BUCKET!
    const key = `${prefix}/${crypto.randomUUID()}.${ext}`
    const buffer = Buffer.from(await file.arrayBuffer())

    await s3.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: buffer,
        ContentType: file.type,
        CacheControl: "private, no-store",
      })
    )

    return { url: `private://${key}` }
  } catch (error: any) {
    return { error: error?.message ?? "Upload failed." }
  }
}

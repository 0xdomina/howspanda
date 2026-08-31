import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MedusaError } from "@medusajs/framework/utils"
import { getSignedUrl } from "@aws-sdk/s3-request-presigner"
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3"
import { randomUUID } from "node:crypto"

// ── Private-proof presigned upload (bypasses Cloudflare + multer) ──
// POST /store/proof-upload/prepare  { mime, size }
// → returns { uploadUrl, key, expiresIn }
//
// The browser PUTs directly to B2, then calls
// POST /store/proof-upload/complete  { key, size, mime }
// → returns { url: "private://..." }

const IMAGE_MAX_BYTES = 10 * 1024 * 1024
const EXT: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
}

let proofClient: S3Client | null = null
let proofClientKey = ""

function getProofClient() {
  const useSharedMediaBucket = process.env.PRIVATE_S3_USE_MEDIA_BUCKET === "true"
  const config = {
    bucket: useSharedMediaBucket ? process.env.S3_BUCKET : process.env.PRIVATE_S3_BUCKET,
    endpoint: useSharedMediaBucket ? process.env.S3_ENDPOINT : process.env.PRIVATE_S3_ENDPOINT,
    region: useSharedMediaBucket
      ? process.env.S3_REGION || "us-east-1"
      : process.env.PRIVATE_S3_REGION || process.env.S3_REGION || "us-east-1",
    accessKeyId: useSharedMediaBucket ? process.env.S3_ACCESS_KEY_ID : process.env.PRIVATE_S3_ACCESS_KEY_ID,
    secretAccessKey: useSharedMediaBucket ? process.env.S3_SECRET_ACCESS_KEY : process.env.PRIVATE_S3_SECRET_ACCESS_KEY,
  }
  if (!Object.values(config).every(Boolean)) return null

  const ck = `${config.endpoint}:${config.region}:${config.accessKeyId}:${config.bucket}`
  if (!proofClient || proofClientKey !== ck) {
    proofClient = new S3Client({
      region: config.region,
      endpoint: config.endpoint,
      forcePathStyle: true,
      credentials: {
        accessKeyId: config.accessKeyId!,
        secretAccessKey: config.secretAccessKey!,
      },
    })
    proofClientKey = ck
  }
  return proofClient
}

function proofPrefix() {
  const privatePrefix = (process.env.PRIVATE_S3_PREFIX || "payment-proofs").replace(/^\/+|\/+$/g, "")
  const sharedPrefix = (process.env.S3_PREFIX || "public howsyou").replace(/^\/+|\/+$/g, "")
  return process.env.PRIVATE_S3_USE_MEDIA_BUCKET === "true"
    ? `${sharedPrefix}/${privatePrefix}`
    : privatePrefix
}

function proofBucket() {
  return process.env.PRIVATE_S3_USE_MEDIA_BUCKET === "true"
    ? process.env.S3_BUCKET
    : process.env.PRIVATE_S3_BUCKET
}

export const POST = async (req: MedusaRequest, res: MedusaResponse) => {
  const body = (req.body ?? {}) as { mime?: string; size?: number }
  const client = getProofClient()

  if (!client || !body.mime || !Number.isInteger(body.size)) {
    throw new MedusaError(MedusaError.Types.INVALID_DATA, "Invalid upload details")
  }

  const size = body.size as number
  const ext = EXT[body.mime]
  if (!ext || size < 1 || size > IMAGE_MAX_BYTES) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "Upload a valid image (PNG, JPEG, or WebP) up to 10MB"
    )
  }

  const key = `${proofPrefix()}/${randomUUID()}.${ext}`
  const uploadUrl = await getSignedUrl(
    client,
    new PutObjectCommand({
      Bucket: proofBucket()!,
      Key: key,
      ContentType: body.mime,
    }),
    { expiresIn: 300 }
  )

  res.json({ key, uploadUrl, expiresIn: 300 })
}

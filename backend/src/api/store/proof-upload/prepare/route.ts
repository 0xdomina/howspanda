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
  const config = {
    bucket: process.env.PRIVATE_S3_BUCKET,
    endpoint: process.env.PRIVATE_S3_ENDPOINT,
    region: process.env.PRIVATE_S3_REGION || process.env.S3_REGION || "us-east-1",
    accessKeyId: process.env.PRIVATE_S3_ACCESS_KEY_ID,
    secretAccessKey: process.env.PRIVATE_S3_SECRET_ACCESS_KEY,
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
  return (process.env.PRIVATE_S3_PREFIX || "payment-proofs").replace(/^\/+|\/+$/g, "")
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
      Bucket: process.env.PRIVATE_S3_BUCKET!,
      Key: key,
      ContentType: body.mime,
      CacheControl: "private, no-store",
    }),
    { expiresIn: 300 }
  )

  res.json({ key, uploadUrl, expiresIn: 300 })
}

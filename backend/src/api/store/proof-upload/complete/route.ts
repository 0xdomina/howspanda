import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MedusaError } from "@medusajs/framework/utils"
import { HeadObjectCommand, S3Client } from "@aws-sdk/client-s3"

const IMAGE_MAX_BYTES = 10 * 1024 * 1024
const EXT_MIME: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  webp: "image/webp",
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
  return (process.env.PRIVATE_S3_PREFIX || "payment-proofs").replace(/^\/+|\/+$/g, "")
}

export const POST = async (req: MedusaRequest, res: MedusaResponse) => {
  const body = (req.body ?? {}) as { key?: string; size?: number; mime?: string }
  const client = getProofClient()

  if (!client || !body.key || !Number.isInteger(body.size) || !body.mime) {
    throw new MedusaError(MedusaError.Types.INVALID_DATA, "Invalid upload completion details")
  }

  // Validate the key is in our prefix and has a safe extension
  const size = body.size as number
  const prefix = proofPrefix()
  const ext = body.mime && EXT_MIME[Object.keys(EXT_MIME).find(k => EXT_MIME[k] === body.mime) ?? ""]
  if (!ext || !body.key.startsWith(prefix + "/") || body.key.includes("..")) {
    throw new MedusaError(MedusaError.Types.INVALID_DATA, "Invalid proof key")
  }

  let head
  try {
    head = await client.send(
      new HeadObjectCommand({ Bucket: process.env.PRIVATE_S3_BUCKET!, Key: body.key })
    )
  } catch {
    throw new MedusaError(MedusaError.Types.INVALID_DATA, "Upload was not completed")
  }

  if (!head.ContentLength || head.ContentLength < 1 || head.ContentLength > IMAGE_MAX_BYTES || head.ContentLength !== size) {
    throw new MedusaError(MedusaError.Types.INVALID_DATA, "Upload size mismatch")
  }

  res.json({ url: `private://${body.key}` })
}

import { GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3"
import { getSignedUrl } from "@aws-sdk/s3-request-presigner"
import { randomUUID } from "crypto"

const PRIVATE_PROOF_PREFIX = "private://"

function privateProofConfig() {
  const useSharedMediaBucket = process.env.PRIVATE_S3_USE_MEDIA_BUCKET === "true"
  const config = {
    bucket: useSharedMediaBucket
      ? process.env.S3_BUCKET
      : process.env.PRIVATE_S3_BUCKET,
    endpoint: useSharedMediaBucket
      ? process.env.S3_ENDPOINT
      : process.env.PRIVATE_S3_ENDPOINT,
    region: useSharedMediaBucket
      ? process.env.S3_REGION || "us-east-1"
      : process.env.PRIVATE_S3_REGION || process.env.S3_REGION || "us-east-1",
    accessKeyId: useSharedMediaBucket
      ? process.env.S3_ACCESS_KEY_ID
      : process.env.PRIVATE_S3_ACCESS_KEY_ID,
    secretAccessKey: useSharedMediaBucket
      ? process.env.S3_SECRET_ACCESS_KEY
      : process.env.PRIVATE_S3_SECRET_ACCESS_KEY,
    prefix: (process.env.PRIVATE_S3_PREFIX || "payment-proofs").replace(/^\/+|\/+$/g, ""),
  }
  return Object.values(config).every(Boolean) ? config : null
}

let client: S3Client | null = null
let clientConfigKey = ""

function getClient(config: NonNullable<ReturnType<typeof privateProofConfig>>) {
  const key = `${config.endpoint}:${config.region}:${config.accessKeyId}:${config.bucket}`
  if (!client || clientConfigKey !== key) {
    client = new S3Client({
      region: config.region,
      endpoint: config.endpoint,
      forcePathStyle: process.env.PRIVATE_S3_FORCE_PATH_STYLE !== "false",
      credentials: {
        accessKeyId: config.accessKeyId!,
        secretAccessKey: config.secretAccessKey!,
      },
    })
    clientConfigKey = key
  }
  return client
}

export function hasPrivatePaymentProofStorage(): boolean {
  return privateProofConfig() !== null
}

export async function uploadPrivatePaymentProof(input: {
  bytes: Buffer
  contentType: string
  extension: string
}): Promise<string> {
  const config = privateProofConfig()
  if (!config) {
    throw new Error("Private payment-proof storage is not configured")
  }

  const key = `${config.prefix}/${randomUUID()}.${input.extension}`
  await getClient(config).send(
    new PutObjectCommand({
      Bucket: config.bucket,
      Key: key,
      Body: input.bytes,
      ContentType: input.contentType,
      CacheControl: "private, no-store",
      ServerSideEncryption:
        process.env.PRIVATE_S3_SERVER_SIDE_ENCRYPTION === "AES256" ||
        process.env.PRIVATE_S3_SERVER_SIDE_ENCRYPTION === "aws:kms"
          ? process.env.PRIVATE_S3_SERVER_SIDE_ENCRYPTION
          : undefined,
    })
  )

  return `${PRIVATE_PROOF_PREFIX}${key}`
}

export async function resolvePaymentProofUrl(value?: string | null): Promise<string | null> {
  if (!value) return null
  if (!value.startsWith(PRIVATE_PROOF_PREFIX)) return value

  const config = privateProofConfig()
  if (!config) return null

  return getSignedUrl(
    getClient(config),
    new GetObjectCommand({
      Bucket: config.bucket,
      Key: value.slice(PRIVATE_PROOF_PREFIX.length),
    }),
    { expiresIn: 300 }
  )
}

const PROOF_IMAGE_EXTENSIONS: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
}
const PROOF_MAX_BYTES = 10 * 1024 * 1024

// Presigned direct-to-B2 upload for buyer proofs. The browser PUTs straight
// to the private bucket, bypassing the API — so Cloudflare's managed
// challenge on multipart POSTs to the backend never blocks a buyer.
export async function prepareProofUpload(input: {
  mime: string
  size: number
}): Promise<{ key: string; uploadUrl: string; expiresIn: number } | null> {
  const config = privateProofConfig()
  const extension = PROOF_IMAGE_EXTENSIONS[input.mime]
  if (!config || !extension || input.size < 1 || input.size > PROOF_MAX_BYTES) {
    return null
  }
  const key = `${config.prefix}/${randomUUID()}.${extension}`
  const uploadUrl = await getSignedUrl(
    getClient(config),
    new PutObjectCommand({
      Bucket: config.bucket,
      Key: key,
      ContentType: input.mime,
      CacheControl: "private, no-store",
    }),
    { expiresIn: 300 }
  )
  return { key, uploadUrl, expiresIn: 300 }
}

export async function completeProofUpload(input: {
  key: string
  expectedSize: number
  mime: string
}): Promise<{ uri: string } | null> {
  const config = privateProofConfig()
  const extension = PROOF_IMAGE_EXTENSIONS[input.mime]
  if (!config || !extension) return null
  if (!input.key.startsWith(config.prefix + "/") || input.key.includes("..")) return null

  const head = await getClient(config).send(
    new HeadObjectCommand({ Bucket: config.bucket, Key: input.key })
  ).catch(() => null)
  if (!head?.ContentLength || head.ContentLength !== input.expectedSize) return null

  return { uri: `${PRIVATE_PROOF_PREFIX}${input.key}`}
}

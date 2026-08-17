import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3"
import { getSignedUrl } from "@aws-sdk/s3-request-presigner"
import { randomUUID } from "crypto"

const PRIVATE_PROOF_PREFIX = "private://"

function privateProofConfig() {
  const config = {
    bucket: process.env.PRIVATE_S3_BUCKET,
    endpoint: process.env.PRIVATE_S3_ENDPOINT,
    region: process.env.PRIVATE_S3_REGION || process.env.S3_REGION || "us-east-1",
    accessKeyId: process.env.PRIVATE_S3_ACCESS_KEY_ID,
    secretAccessKey: process.env.PRIVATE_S3_SECRET_ACCESS_KEY,
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

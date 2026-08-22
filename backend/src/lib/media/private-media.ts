import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3"
import { getSignedUrl } from "@aws-sdk/s3-request-presigner"

const MEDIA_PREFIX = "public howsyou/"

function mediaConfig() {
  const regular = {
    bucket: process.env.S3_BUCKET,
    endpoint: process.env.S3_ENDPOINT,
    region: process.env.S3_REGION || "us-east-1",
    accessKeyId: process.env.S3_ACCESS_KEY_ID,
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
  }
  const privateStorage = {
    bucket: process.env.PRIVATE_S3_BUCKET,
    endpoint: process.env.PRIVATE_S3_ENDPOINT,
    region: process.env.PRIVATE_S3_REGION || regular.region,
    accessKeyId: process.env.PRIVATE_S3_ACCESS_KEY_ID,
    secretAccessKey: process.env.PRIVATE_S3_SECRET_ACCESS_KEY,
  }
  const config = Object.values(regular).every(Boolean) ? regular : privateStorage
  return Object.values(config).every(Boolean) ? config : null
}

let client: S3Client | null = null
let clientConfigKey = ""

function getClient(config: NonNullable<ReturnType<typeof mediaConfig>>) {
  const key = `${config.endpoint}:${config.region}:${config.accessKeyId}:${config.bucket}`
  if (!client || clientConfigKey !== key) {
    client = new S3Client({
      region: config.region,
      endpoint: config.endpoint,
      forcePathStyle: true,
      credentials: {
        accessKeyId: config.accessKeyId!,
        secretAccessKey: config.secretAccessKey!,
      },
    })
    clientConfigKey = key
  }
  return client
}

export async function signMediaPath(rawPath: string): Promise<string | null> {
  const config = mediaConfig()
  if (!config) return null

  const path = rawPath
    .split("/")
    .map((segment) => decodeURIComponent(segment))
    .join("/")

  if (!path.startsWith(MEDIA_PREFIX) || path.includes("..")) return null

  return getSignedUrl(
    getClient(config),
    new GetObjectCommand({ Bucket: config.bucket, Key: path }),
    { expiresIn: 300 }
  )
}

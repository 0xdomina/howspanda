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

// Stable, cacheable signed reads for storefront media.
//
// B2 bucket stays private (no credit-card public switch). SigV4 presigned URLs
// embed the signing date, so signing per request would churn the URL every
// call and defeat CDN caching — every image view would wake the API. Instead
// each key is signed ONCE with a 30-day lifetime and the exact URL is memoized
// until 3 days before expiry. Browsers and Vercel's image CDN cache the same
// URL for a month, so the backend is needed only once per image per month
// even on a free-tier host that sleeps. Invalidation is via metadata edit /
// delete / state change which generates a new key and thus a new signed URL.
const MEDIA_URL_TTL_SECONDS = 30 * 24 * 60 * 60
const MEDIA_URL_REFRESH_BEFORE = 3 * 24 * 60 * 60

const signedUrlCache = new Map<string, { url: string; expiresAt: number }>()

export async function signMediaPath(rawPath: string): Promise<string | null> {
  const config = mediaConfig()
  if (!config) return null

  const path = rawPath
    .split("/")
    .map((segment) => decodeURIComponent(segment))
    .join("/")

  if (!path.startsWith(MEDIA_PREFIX) || path.includes("..")) return null

  const cached = signedUrlCache.get(path)
  if (cached && cached.expiresAt - Date.now() > MEDIA_URL_REFRESH_BEFORE * 1000) {
    return cached.url
  }

  const url = await getSignedUrl(
    getClient(config),
    new GetObjectCommand({ Bucket: config.bucket, Key: path }),
    { expiresIn: MEDIA_URL_TTL_SECONDS }
  )
  signedUrlCache.set(path, {
    url,
    expiresAt: Date.now() + MEDIA_URL_TTL_SECONDS * 1000,
  })
  return url
}

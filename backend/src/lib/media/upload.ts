import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3"
import { getSignedUrl } from "@aws-sdk/s3-request-presigner"
import { MedusaError } from "@medusajs/framework/utils"
import { randomUUID } from "crypto"
import { sniffMedia } from "../upload/sniff"
import { validateMediaMetadata } from "../upload/metadata"

export const MEDIA_OBJECT_PREFIX = "public howsyou/"

const IMAGE_MAX_BYTES = 10 * 1024 * 1024
const VIDEO_MAX_BYTES = 40 * 1024 * 1024

type MediaKind = "image" | "video"

type MediaStorageConfig = {
  bucket: string
  endpoint: string
  region: string
  accessKeyId: string
  secretAccessKey: string
}

let client: S3Client | null = null
let clientConfigKey = ""

function mediaStorageConfig(): MediaStorageConfig | null {
  const regular = {
    bucket: process.env.S3_BUCKET,
    endpoint: process.env.S3_ENDPOINT,
    region: process.env.S3_REGION || "us-east-1",
    accessKeyId: process.env.S3_ACCESS_KEY_ID,
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
  }

  // A private B2 bucket is a safe fallback for product media. The media proxy
  // signs reads, and the distinct object prefix keeps payment proofs isolated.
  const privateStorage = {
    bucket: process.env.PRIVATE_S3_BUCKET,
    endpoint: process.env.PRIVATE_S3_ENDPOINT,
    region: process.env.PRIVATE_S3_REGION || regular.region,
    accessKeyId: process.env.PRIVATE_S3_ACCESS_KEY_ID,
    secretAccessKey: process.env.PRIVATE_S3_SECRET_ACCESS_KEY,
  }

  const selected = Object.values(regular).every(Boolean) ? regular : privateStorage
  return Object.values(selected).every(Boolean)
    ? (selected as MediaStorageConfig)
    : null
}

function getClient(config: MediaStorageConfig) {
  const key = `${config.endpoint}:${config.region}:${config.accessKeyId}:${config.bucket}`
  if (!client || clientConfigKey !== key) {
    client = new S3Client({
      region: config.region,
      endpoint: config.endpoint,
      forcePathStyle: true,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
    })
    clientConfigKey = key
  }
  return client
}

function publicUrlForKey(key: string) {
  // Stored references point at the /media proxy: the bucket is private, and
  // the proxy 302s to a week-long stable signed B2 URL with immutable caching,
  // so images keep loading from CDN even while the API sleeps. Set
  // MEDIA_PUBLIC_URL only if the bucket ever becomes public/CDN-fronted.
  const explicit = process.env.MEDIA_PUBLIC_URL
  const base = (
    explicit ||
    process.env.S3_URL ||
    `${process.env.BACKEND_URL || "https://hows-u-api-final.pandastack.app"}/media`
  ).replace(/\/$/, "")
  return `${base}/${key.split("/").map(encodeURIComponent).join("/")}`
}

function extensionFor(kind: MediaKind, mime: string) {
  if (kind === "image") {
    const extensions: Record<string, string> = {
      "image/jpeg": "jpg",
      "image/png": "png",
      "image/webp": "webp",
      "image/avif": "avif",
    }
    return extensions[mime]
  }
  const extensions: Record<string, string> = {
    "video/mp4": "mp4",
    "video/quicktime": "mp4",
  }
  return extensions[mime]
}

export function mediaStorageReady() {
  return Boolean(mediaStorageConfig() && process.env.S3_URL)
}

export async function prepareMediaUpload(input: {
  ownerId: string
  kind: MediaKind
  mime: string
  size: number
}) {
  const config = mediaStorageConfig()
  const extension = extensionFor(input.kind, input.mime)
  const maximum = input.kind === "image" ? IMAGE_MAX_BYTES : VIDEO_MAX_BYTES

  if (!config) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "Media storage is not configured"
    )
  }
  if (!extension || input.size < 1 || input.size > maximum) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      input.kind === "image"
        ? "Upload a valid photo up to 10MB"
        : "Upload a valid video up to 40MB"
    )
  }

  const owner = input.ownerId.replace(/[^a-zA-Z0-9_-]/g, "")
  if (!owner) {
    throw new MedusaError(MedusaError.Types.INVALID_DATA, "Invalid media owner")
  }
  const key = `${MEDIA_OBJECT_PREFIX}${owner}/${randomUUID()}.${extension}`
  const uploadUrl = await getSignedUrl(
    getClient(config),
    new PutObjectCommand({
      Bucket: config.bucket,
      Key: key,
      ContentType: input.mime,
    }),
    { expiresIn: 300 }
  )

  return {
    key,
    uploadUrl,
    url: publicUrlForKey(key),
    expiresIn: 300,
  }
}

export async function completeMediaUpload(input: {
  ownerId: string
  key: string
  kind: MediaKind
  expectedSize: number
}) {
  const config = mediaStorageConfig()
  if (!config) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "Media storage is not configured"
    )
  }
  const owner = input.ownerId.replace(/[^a-zA-Z0-9_-]/g, "")
  const keyPattern = `^${MEDIA_OBJECT_PREFIX.replace(" ", "\\s")}${owner}/[0-9a-f-]+\\.(?:jpg|png|webp|avif|mp4)$`
  if (!owner || !new RegExp(keyPattern, "i").test(input.key)) {
    throw new MedusaError(MedusaError.Types.INVALID_DATA, "Invalid media upload")
  }

  const s3 = getClient(config)
  let head
  try {
    head = await s3.send(new HeadObjectCommand({ Bucket: config.bucket, Key: input.key }))
  } catch {
    throw new MedusaError(MedusaError.Types.INVALID_DATA, "Media upload was not completed")
  }

  const maximum = input.kind === "image" ? IMAGE_MAX_BYTES : VIDEO_MAX_BYTES
  if (!head.ContentLength || head.ContentLength < 1 || head.ContentLength > maximum || head.ContentLength !== input.expectedSize) {
    await s3.send(new DeleteObjectCommand({ Bucket: config.bucket, Key: input.key })).catch(() => undefined)
    throw new MedusaError(MedusaError.Types.INVALID_DATA, "Media upload size is invalid")
  }

  const object = await s3.send(new GetObjectCommand({ Bucket: config.bucket, Key: input.key }))
  const bytes = object.Body ? Buffer.from(await object.Body.transformToByteArray()) : Buffer.alloc(0)
  try {
    const sniffed = sniffMedia(bytes)
    if (sniffed.kind !== input.kind) throw new Error("kind")
    const metadata = validateMediaMetadata(bytes, input.kind, sniffed.ext)
    return {
      url: publicUrlForKey(input.key),
      kind: input.kind,
      mime: sniffed.mime,
      size: bytes.length,
      width: metadata.width,
      height: metadata.height,
      duration_seconds: metadata.durationSeconds,
    }
  } catch (error) {
    await s3.send(new DeleteObjectCommand({ Bucket: config.bucket, Key: input.key })).catch(() => undefined)
    if (error instanceof MedusaError) throw error
    throw new MedusaError(MedusaError.Types.INVALID_DATA, "That media file failed validation")
  }
}

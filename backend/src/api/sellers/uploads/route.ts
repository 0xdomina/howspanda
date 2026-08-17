import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { MedusaError, Modules } from "@medusajs/framework/utils"
import { randomUUID } from "crypto"
import { mkdir, writeFile } from "fs/promises"
import path from "path"
import multer from "multer"
import { sniffMedia, MediaKind } from "../../../lib/upload/sniff"
import { validateMediaMetadata } from "../../../lib/upload/metadata"

const IMAGE_MAX_BYTES = 10 * 1024 * 1024
const VIDEO_MAX_BYTES = 40 * 1024 * 1024

// multipart/form-data is never parsed by Medusa's body parsers (json/text/
// urlencoded only), so the raw stream reaches multer untouched. Memory storage
// keeps the cap honest; per-kind limits are enforced after sniffing.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: VIDEO_MAX_BYTES, files: 1, fields: 2, fieldSize: 4096, parts: 3 },
}).single("file")

const parseMultipart = (req: unknown, res: unknown) =>
  new Promise<void>((resolve, reject) => {
    upload(req, res, (err?: unknown) => (err ? reject(err) : resolve()))
  })

type UploadRequest = AuthenticatedMedusaRequest & {
  file?: {
    fieldname: string
    originalname: string
    mimetype: string
    size: number
    buffer: Buffer
  }
  body: { kind?: string } & Record<string, unknown>
}

// Sellers upload product media (a photo, or a short MP4 video). The file is
// read into memory, sniffed against its actual bytes (never the declared
// Content-Type), and written under uploads/<kind>/ with a random name. Only
// the resulting URL is returned; products reference it as `photo`/`video_url`.
export const POST = async (
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) => {
  const uploadReq = req as UploadRequest

  try {
    await parseMultipart(uploadReq, res)
  } catch (err: any) {
    if (err?.code === "LIMIT_FILE_SIZE") {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        `File too large — max ${VIDEO_MAX_BYTES / 1024 / 1024}MB`
      )
    }
    if (typeof err?.code === "string" && err.code.startsWith("LIMIT_")) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "Upload form is too large or contains too many parts"
      )
    }
    throw err
  }

  const kind = uploadReq.body.kind
  if (kind !== "image" && kind !== "video") {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      'kind must be "image" or "video"'
    )
  }

  const file = uploadReq.file
  if (!file) {
    throw new MedusaError(MedusaError.Types.INVALID_DATA, "Missing file part")
  }

  const sniffed = sniffMedia(file.buffer)

  if (sniffed.kind !== kind) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      `File bytes are ${sniffed.kind}, not ${kind}`
    )
  }

  const maxBytes = kind === "image" ? IMAGE_MAX_BYTES : VIDEO_MAX_BYTES
  if (file.size > maxBytes) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      `File too large — max ${maxBytes / 1024 / 1024}MB for ${kind}s`
    )
  }
  if (sniffed.ext === "gif") {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "Animated images are not supported. Upload a photo instead."
    )
  }
  const metadata = validateMediaMetadata(file.buffer, kind, sniffed.ext)

  // `filename` is a generated UUID + sniffed extension and `kind` is
  // whitelisted above, but keep the write provably bounded under the uploads
  // root regardless of future edits (path traversal defense-in-depth).
  const filename = `${randomUUID()}.${sniffed.ext}`
  const root = path.resolve(process.cwd(), "uploads")
  const dir = path.join(root, kind)
  const target = path.resolve(dir, filename)
  if (target !== root && !target.startsWith(root + path.sep)) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "Resolved upload path escapes the uploads root"
    )
  }

  // S3-compatible storage (Backblaze B2 in production) when configured —
  // deploy containers have ephemeral disks, so local writes only serve dev.
  // The file service returns the public URL built from S3_URL; the media
  // reference validator accepts absolute http(s) URLs as well as /uploads.
  if (
    process.env.S3_BUCKET &&
    process.env.S3_ACCESS_KEY_ID &&
    process.env.S3_SECRET_ACCESS_KEY
  ) {
    const fileService = req.scope.resolve(Modules.FILE) as unknown as {
      upload(input: {
        filename: string
        mimeType: string
        content: string
        access: "public"
      }): Promise<{ url: string; key: string }>
    }
    const uploaded = await fileService.upload({
      filename,
      mimeType: sniffed.mime,
      content: file.buffer.toString("base64"),
      access: "public",
    })
    return res.json({
      url: uploaded.url,
      kind,
      mime: sniffed.mime,
      size: file.size,
      width: metadata.width,
      height: metadata.height,
      duration_seconds: metadata.durationSeconds,
    })
  }

  await mkdir(dir, { recursive: true })
  await writeFile(target, file.buffer)

  res.json({
    url: `/uploads/${kind}/${filename}`,
    kind,
    mime: sniffed.mime,
    size: file.size,
    width: metadata.width,
    height: metadata.height,
    duration_seconds: metadata.durationSeconds,
  })
}

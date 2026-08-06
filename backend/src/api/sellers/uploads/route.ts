import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { MedusaError } from "@medusajs/framework/utils"
import { randomUUID } from "crypto"
import { mkdir, writeFile } from "fs/promises"
import path from "path"
import multer from "multer"
import { sniffMedia, MediaKind } from "../../../lib/upload/sniff"

const IMAGE_MAX_BYTES = 10 * 1024 * 1024
const VIDEO_MAX_BYTES = 60 * 1024 * 1024

// multipart/form-data is never parsed by Medusa's body parsers (json/text/
// urlencoded only), so the raw stream reaches multer untouched. Memory storage
// keeps the cap honest; per-kind limits are enforced after sniffing.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: VIDEO_MAX_BYTES, files: 1 },
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

  const filename = `${randomUUID()}.${sniffed.ext}`
  const dir = path.join(process.cwd(), "uploads", kind)
  await mkdir(dir, { recursive: true })
  await writeFile(path.join(dir, filename), file.buffer)

  res.json({
    url: `/uploads/${kind}/${filename}`,
    kind,
    mime: sniffed.mime,
    size: file.size,
  })
}

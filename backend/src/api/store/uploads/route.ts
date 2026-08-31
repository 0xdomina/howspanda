import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MedusaError, Modules } from "@medusajs/framework/utils"
import { randomUUID } from "crypto"
import { mkdir, readFile, writeFile } from "fs/promises"
import path from "path"
import multer from "multer"
import { sniffMedia } from "../../../lib/upload/sniff"
import { validateMediaMetadata } from "../../../lib/upload/metadata"
import {
  hasPrivatePaymentProofStorage,
  uploadPrivatePaymentProof,
  prepareProofUpload,
  completeProofUpload,
} from "../../../lib/bank-transfer/private-proof"

const IMAGE_MAX_BYTES = 10 * 1024 * 1024

// Buyer proof-of-payment upload (bank transfer screenshots). Guests upload
// without a session, so this is deliberately image-only and public — the
// proof becomes useful only once it is bound to an order via
// POST /store/orders/:id/bank-proof, which enforces email ownership.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: IMAGE_MAX_BYTES, files: 1, fields: 2, fieldSize: 4096, parts: 3 },
}).single("file")

const parseMultipart = (req: unknown, res: unknown) =>
  new Promise<void>((resolve, reject) => {
    upload(req, res, (err?: unknown) => (err ? reject(err) : resolve()))
  })

type UploadRequest = MedusaRequest & {
  file?: {
    originalname: string
    mimetype: string
    size: number
    buffer: Buffer
  }
  body: { kind?: string } & Record<string, unknown>
}

const PROOF_IMAGE_MAX_BYTES = 10 * 1024 * 1024

async function readJsonBody(req: MedusaRequest): Promise<Record<string, unknown>> {
  // Medusa may not parse JSON on this route (multer occupies the body pipeline).
  // Read the raw stream and parse it manually when Content-Type is JSON.
  if (typeof req.body === "object" && req.body !== null && Object.keys(req.body).length > 0) {
    return req.body as Record<string, unknown>
  }
  const chunks: Buffer[] = []
  for await (const chunk of req) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk)
  }
  if (!chunks.length) return {}
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"))
  } catch {
    return {}
  }
}

export const POST = async (req: MedusaRequest, res: MedusaResponse) => {
  const uploadReq = req as UploadRequest

  // ── Presigned direct-to-B2 flow (bypasses Cloudflare on multipart POSTs) ──
  // When Content-Type is application/json, this is the presigned flow.
  // Multer only handles multipart/form-data, so JSON requests must be
  // intercepted before multer tries to parse them.
  const ct = (req.headers["content-type"] ?? "") as string
  if (ct.includes("application/json")) {
    const body = await readJsonBody(req)
    const kind = (body.kind ?? "") as string

    if (kind === "proof-prepare") {
      const { mime, size } = body as { mime?: string; size?: number }
      if (!hasPrivatePaymentProofStorage() || !mime || !Number.isInteger(size)) {
        throw new MedusaError(MedusaError.Types.INVALID_DATA, "Invalid upload details")
      }
      const prepared = await prepareProofUpload({ mime, size: size! })
      if (!prepared) {
        throw new MedusaError(MedusaError.Types.INVALID_DATA, "Upload a valid image (PNG, JPEG, or WebP) up to 10MB")
      }
      res.json(prepared)
      return
    }

    if (kind === "proof-complete") {
      const { key, size, mime } = body as { key?: string; size?: number; mime?: string }
      if (!key || !Number.isInteger(size) || !mime) {
        throw new MedusaError(MedusaError.Types.INVALID_DATA, "Invalid upload completion details")
      }
      const result = await completeProofUpload({ key, expectedSize: size!, mime })
      if (!result) {
        throw new MedusaError(MedusaError.Types.INVALID_DATA, "Upload was not completed or the file failed validation")
      }
      res.json({ url: result.uri })
      return
    }

    throw new MedusaError(MedusaError.Types.INVALID_DATA, "Missing kind parameter")
  }

  // ── Legacy multipart upload (kept for backward compatibility) ──
  try {
    await parseMultipart(uploadReq, res)
  } catch (err: any) {
    if (err?.code === "LIMIT_FILE_SIZE") {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        `File too large — max ${IMAGE_MAX_BYTES / 1024 / 1024}MB`
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

  const file = uploadReq.file
  if (!file) {
    throw new MedusaError(MedusaError.Types.INVALID_DATA, "Missing file part")
  }

  const sniffed = sniffMedia(file.buffer)
  if (sniffed.kind !== "image") {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "Only image files are allowed"
    )
  }
  if (sniffed.ext === "gif") {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "Animated images are not supported. Upload a screenshot instead."
    )
  }
  const metadata = validateMediaMetadata(file.buffer, "image", sniffed.ext)

  const filename = `${randomUUID()}.${sniffed.ext}`
  if (hasPrivatePaymentProofStorage()) {
    const reference = await uploadPrivatePaymentProof({
      bytes: file.buffer,
      contentType: sniffed.mime,
      extension: sniffed.ext,
    })
    res.json({
      url: reference,
      kind: "image",
      mime: sniffed.mime,
      size: file.size,
      width: metadata.width,
      height: metadata.height,
      duration_seconds: null,
    })
    return
  }

  if (process.env.NODE_ENV === "production") {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "Payment-proof storage is not configured"
    )
  }

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
      // Keep payment proofs in a separate key namespace inside the configured
      // media bucket so they can be migrated to a private bucket later.
      filename: `proof/${filename}`,
      mimeType: sniffed.mime,
      content: file.buffer.toString("base64"),
      access: "public",
    })
    res.json({
      url: uploaded.url,
      kind: "image",
      mime: sniffed.mime,
      size: file.size,
      width: metadata.width,
      height: metadata.height,
      duration_seconds: null,
    })
    return
  }

  const dir = path.join(process.cwd(), "uploads", "proof")
  await mkdir(dir, { recursive: true })
  await writeFile(path.join(dir, filename), file.buffer)

  res.json({
    url: `/uploads/proof/${filename}`,
    kind: "image",
    mime: sniffed.mime,
    size: file.size,
    width: metadata.width,
    height: metadata.height,
    duration_seconds: null,
  })
}

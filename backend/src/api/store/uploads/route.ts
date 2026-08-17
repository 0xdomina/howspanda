import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MedusaError, Modules } from "@medusajs/framework/utils"
import { randomUUID } from "crypto"
import { mkdir, writeFile } from "fs/promises"
import path from "path"
import multer from "multer"
import { sniffMedia } from "../../../lib/upload/sniff"
import {
  hasPrivatePaymentProofStorage,
  uploadPrivatePaymentProof,
} from "../../../lib/bank-transfer/private-proof"

const IMAGE_MAX_BYTES = 10 * 1024 * 1024

// Buyer proof-of-payment upload (bank transfer screenshots). Guests upload
// without a session, so this is deliberately image-only and public — the
// proof becomes useful only once it is bound to an order via
// POST /store/orders/:id/bank-proof, which enforces email ownership.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: IMAGE_MAX_BYTES, files: 1 },
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

export const POST = async (req: MedusaRequest, res: MedusaResponse) => {
  const uploadReq = req as UploadRequest

  try {
    await parseMultipart(uploadReq, res)
  } catch (err: any) {
    if (err?.code === "LIMIT_FILE_SIZE") {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        `File too large — max ${IMAGE_MAX_BYTES / 1024 / 1024}MB`
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
  })
}

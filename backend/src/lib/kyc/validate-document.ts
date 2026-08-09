import { createHash } from "node:crypto"
import { MedusaError } from "@medusajs/framework/utils"
import { sniffMedia } from "../upload/sniff"

export const KYC_DOCUMENT_MAX_BYTES = 8 * 1024 * 1024

type ImageDimensions = { width: number; height: number }

function jpegDimensions(buffer: Buffer): ImageDimensions | null {
  let offset = 2
  while (offset + 9 < buffer.length) {
    if (buffer[offset] !== 0xff) {
      offset += 1
      continue
    }
    const marker = buffer[offset + 1]
    offset += 2
    if (marker === 0xd8 || marker === 0xd9) continue
    if (offset + 2 > buffer.length) return null
    const length = buffer.readUInt16BE(offset)
    if (length < 2 || offset + length > buffer.length) return null
    const isFrame =
      (marker >= 0xc0 && marker <= 0xc3) ||
      (marker >= 0xc5 && marker <= 0xc7) ||
      (marker >= 0xc9 && marker <= 0xcb) ||
      (marker >= 0xcd && marker <= 0xcf)
    if (isFrame && length >= 7) {
      return {
        height: buffer.readUInt16BE(offset + 3),
        width: buffer.readUInt16BE(offset + 5),
      }
    }
    offset += length
  }
  return null
}

function imageDimensions(
  buffer: Buffer,
  ext: string
): ImageDimensions | null {
  if (ext === "png" && buffer.length >= 24) {
    return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) }
  }
  if (ext === "jpg") return jpegDimensions(buffer)
  if (ext === "webp" && buffer.length >= 30) {
    const chunk = buffer.toString("latin1", 12, 16)
    if (chunk === "VP8X") {
      return {
        width: 1 + buffer[24] + (buffer[25] << 8) + (buffer[26] << 16),
        height: 1 + buffer[27] + (buffer[28] << 8) + (buffer[29] << 16),
      }
    }
  }
  return null
}

export type ValidatedKycDocument = {
  sha256: string
  mime: string
  size: number
  width: number | null
  height: number | null
}

/** Validate the uploaded bytes and return non-sensitive metadata only. */
export function validateKycDocument(buffer: Buffer): ValidatedKycDocument {
  if (!buffer.length) {
    throw new MedusaError(MedusaError.Types.INVALID_DATA, "Empty ID document")
  }
  if (buffer.length > KYC_DOCUMENT_MAX_BYTES) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "ID document is too large. Upload an image smaller than 8MB."
    )
  }

  const sniffed = sniffMedia(buffer)
  if (
    sniffed.kind !== "image" ||
    !["jpg", "png", "webp"].includes(sniffed.ext)
  ) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "Upload a real JPEG, PNG or WebP photo of your ID card."
    )
  }

  const dimensions = imageDimensions(buffer, sniffed.ext)
  if (
    dimensions &&
    (Math.min(dimensions.width, dimensions.height) < 200 ||
      Math.max(dimensions.width, dimensions.height) < 320)
  ) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "The ID photo is too small to read. Upload a clearer card image."
    )
  }

  return {
    sha256: createHash("sha256").update(buffer).digest("hex"),
    mime: sniffed.mime,
    size: buffer.length,
    width: dimensions?.width ?? null,
    height: dimensions?.height ?? null,
  }
}

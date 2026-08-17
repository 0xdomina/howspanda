import { MedusaError } from "@medusajs/framework/utils"

export type MediaMetadata = {
  width: number | null
  height: number | null
  durationSeconds: number | null
}

const MAX_IMAGE_DIMENSION = 6000
const MAX_IMAGE_PIXELS = 25_000_000
const MAX_VIDEO_DIMENSION = 1920
const MAX_VIDEO_PIXELS = 4_000_000
const MAX_VIDEO_SECONDS = 30

function imageDimensions(buffer: Buffer, ext: string) {
  if (ext === "png" && buffer.length >= 24) {
    return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) }
  }

  if (ext === "jpg") {
    let offset = 2
    while (offset + 9 < buffer.length) {
      if (buffer[offset] !== 0xff) {
        offset += 1
        continue
      }
      const marker = buffer[offset + 1]
      offset += 2
      if (marker === 0xd8 || marker === 0xd9) continue
      if (offset + 2 > buffer.length) break
      const length = buffer.readUInt16BE(offset)
      if (length < 2 || offset + length > buffer.length) break
      const frame =
        (marker >= 0xc0 && marker <= 0xc3) ||
        (marker >= 0xc5 && marker <= 0xc7) ||
        (marker >= 0xc9 && marker <= 0xcb) ||
        (marker >= 0xcd && marker <= 0xcf)
      if (frame && length >= 7) {
        return {
          height: buffer.readUInt16BE(offset + 3),
          width: buffer.readUInt16BE(offset + 5),
        }
      }
      offset += length
    }
  }

  if (ext === "webp" && buffer.length >= 30) {
    const chunk = buffer.toString("latin1", 12, 16)
    if (chunk === "VP8X") {
      return {
        width: 1 + buffer[24] + (buffer[25] << 8) + (buffer[26] << 16),
        height: 1 + buffer[27] + (buffer[28] << 8) + (buffer[29] << 16),
      }
    }
    if (chunk === "VP8 ") {
      const start = 26
      if (buffer.length >= start + 4) {
        return {
          width: buffer.readUInt16LE(start) & 0x3fff,
          height: buffer.readUInt16LE(start + 2) & 0x3fff,
        }
      }
    }
    if (chunk === "VP8L" && buffer.length >= 25) {
      const bits = buffer.readUInt32LE(21)
      return {
        width: 1 + (bits & 0x3fff),
        height: 1 + ((bits >>> 14) & 0x3fff),
      }
    }
  }

  return null
}

function readBoxEnd(buffer: Buffer, start: number, end: number) {
  if (start + 8 > end) return null
  const size = buffer.readUInt32BE(start)
  const type = buffer.toString("latin1", start + 4, start + 8)
  if (size === 0) return { type, payloadStart: start + 8, boxEnd: end }
  if (size === 1 || size < 8 || start + size > end) return null
  return { type, payloadStart: start + 8, boxEnd: start + size }
}

function findMp4Box(buffer: Buffer, start: number, end: number, wanted: string): { payloadStart: number; boxEnd: number } | null {
  let cursor = start
  while (cursor + 8 <= end) {
    const box = readBoxEnd(buffer, cursor, end)
    if (!box) return null
    if (box.type === wanted) return box
    if (["meta", "moov", "trak", "mdia", "iprp", "ipco"].includes(box.type)) {
      // `meta` is a FullBox, so its four version/flags bytes precede its
      // child boxes. The other containers begin directly with a child box.
      const nestedStart = box.type === "meta" ? box.payloadStart + 4 : box.payloadStart
      const nested = findMp4Box(buffer, nestedStart, box.boxEnd, wanted)
      if (nested) return nested
    }
    if (box.boxEnd <= cursor) return null
    cursor = box.boxEnd
  }
  return null
}

function bmffDimensions(buffer: Buffer) {
  const box = findMp4Box(buffer, 0, buffer.length, "ispe")
  if (!box || box.payloadStart + 12 > box.boxEnd) return null
  return {
    width: buffer.readUInt32BE(box.payloadStart + 4),
    height: buffer.readUInt32BE(box.payloadStart + 8),
  }
}

function mp4Duration(buffer: Buffer): number | null {
  const box = findMp4Box(buffer, 0, buffer.length, "mvhd")
  if (!box || box.payloadStart + 28 > box.boxEnd) return null
  const version = buffer[box.payloadStart]
  if (version === 0 && box.payloadStart + 20 <= box.boxEnd) {
    const timescale = buffer.readUInt32BE(box.payloadStart + 12)
    const duration = buffer.readUInt32BE(box.payloadStart + 16)
    return timescale ? duration / timescale : null
  }
  if (version === 1 && box.payloadStart + 32 <= box.boxEnd) {
    const timescale = buffer.readUInt32BE(box.payloadStart + 20)
    const duration = Number(buffer.readBigUInt64BE(box.payloadStart + 24))
    return timescale ? duration / timescale : null
  }
  return null
}

function mp4Dimensions(buffer: Buffer) {
  const box = findMp4Box(buffer, 0, buffer.length, "tkhd")
  if (!box || box.payloadStart + 84 > box.boxEnd) return null
  const version = buffer[box.payloadStart]
  const widthOffset = version === 1 ? box.payloadStart + 88 : box.payloadStart + 76
  if (widthOffset + 8 > box.boxEnd) return null
  return {
    width: buffer.readUInt32BE(widthOffset) / 65536,
    height: buffer.readUInt32BE(widthOffset + 4) / 65536,
  }
}

export function validateMediaMetadata(
  buffer: Buffer,
  kind: "image" | "video",
  ext: string
): MediaMetadata {
  const dimensions =
    kind === "image"
      ? ext === "avif"
        ? bmffDimensions(buffer)
        : imageDimensions(buffer, ext)
      : null
  if (kind === "image" && !dimensions) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "That image could not be read. Upload a valid photo."
    )
  }
  if (dimensions) {
    const { width, height } = dimensions
    if (
      width < 1 ||
      height < 1 ||
      width > MAX_IMAGE_DIMENSION ||
      height > MAX_IMAGE_DIMENSION ||
      width * height > MAX_IMAGE_PIXELS
    ) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "That image is too large to display safely. Choose a smaller photo."
      )
    }
  }

  const videoDimensions = kind === "video" ? mp4Dimensions(buffer) : null
  const durationSeconds = kind === "video" ? mp4Duration(buffer) : null
  if (kind === "video" && (!videoDimensions || durationSeconds == null)) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "That video could not be read. Upload a playable MP4 clip."
    )
  }
  if (
    kind === "video" &&
    (videoDimensions!.width > MAX_VIDEO_DIMENSION ||
      videoDimensions!.height > MAX_VIDEO_DIMENSION ||
      videoDimensions!.width * videoDimensions!.height > MAX_VIDEO_PIXELS)
  ) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "Videos must be 1920px or smaller on their longest side"
    )
  }
  if (kind === "video" && durationSeconds! > MAX_VIDEO_SECONDS + 0.5) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "Videos must be 30 seconds or shorter"
    )
  }

  return {
    width: dimensions?.width ?? videoDimensions?.width ?? null,
    height: dimensions?.height ?? videoDimensions?.height ?? null,
    durationSeconds,
  }
}

import { MedusaError } from "@medusajs/framework/utils"

export type MediaKind = "image" | "video"

export interface SniffedMedia {
  kind: MediaKind
  ext: string
  mime: string
}

// Upload security trusts the bytes, never the declared Content-Type or file
// extension. The sniffer maps leading magic bytes to a canonical kind +
// extension + MIME type; anything that does not match is rejected outright.
// SVG/HTML/JS are blocked explicitly (SVG is the classic stored-XSS carrier in
// `<img>` contexts). Files are later served with a fixed whitelisted
// Content-Type and `X-Content-Type-Options: nosniff` so the browser renders
// the bytes as the image/video they claim to be.
const IMAGE_SIGNATURES: {
  ext: string
  mime: string
  match: (b: Buffer) => boolean
}[] = [
  {
    ext: "png",
    mime: "image/png",
    match: (b) =>
      b.length > 8 &&
      b.readUInt32BE(0) === 0x89504e47 &&
      b.readUInt32BE(4) === 0x0d0a1a0a,
  },
  {
    ext: "jpg",
    mime: "image/jpeg",
    match: (b) => b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  },
  {
    ext: "webp",
    mime: "image/webp",
    match: (b) =>
      b.length > 12 &&
      b.toString("latin1", 0, 4) === "RIFF" &&
      b.toString("latin1", 8, 12) === "WEBP",
  },
  {
    ext: "gif",
    mime: "image/gif",
    match: (b) =>
      b.length > 6 &&
      (b.toString("latin1", 0, 6) === "GIF87a" ||
        b.toString("latin1", 0, 6) === "GIF89a"),
  },
]

// ISO-BMFF (`....ftyp`) containers carry both AVIF (image) and MP4 (video).
// The brand right after the box header decides which.
const AVIF_BRANDS = new Set(["avif", "avis", "av01", "mif1", "msf1"])
const HEIF_BRANDS = new Set(["heic", "heix", "hevc", "hevx", "heif", "heis", "heim"])

function sniffIsoBmff(b: Buffer): SniffedMedia | null {
  if (b.length < 12 || b.toString("latin1", 4, 8) !== "ftyp") return null
  const brand = b.toString("latin1", 8, 12)
  if (AVIF_BRANDS.has(brand)) {
    return { kind: "image", ext: "avif", mime: "image/avif" }
  }
  if (HEIF_BRANDS.has(brand)) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "HEIC images are not supported — convert to JPEG or PNG first"
    )
  }
  return { kind: "video", ext: "mp4", mime: "video/mp4" }
}

const MARKUP_RE = /<svg[\s>]|<\?xml|<script|<!doctype\s+html|<html/i

export function sniffMedia(buf: Buffer): SniffedMedia {
  if (!buf || buf.length === 0) {
    throw new MedusaError(MedusaError.Types.INVALID_DATA, "Empty file upload")
  }

  for (const s of IMAGE_SIGNATURES) {
    if (s.match(buf)) {
      return { kind: "image", ext: s.ext, mime: s.mime }
    }
  }

  const bmff = sniffIsoBmff(buf)
  if (bmff) return bmff

  const head = buf
    .subarray(0, 1024)
    .toString("latin1")
    .replace(/^\uFEFF/, "")
    .trimStart()
  if (MARKUP_RE.test(head)) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "SVG and HTML files are not allowed — upload a real photo"
    )
  }

  throw new MedusaError(
    MedusaError.Types.INVALID_DATA,
    "Unrecognized file — upload a JPEG, PNG, WebP, GIF or AVIF image, or an MP4 video"
  )
}

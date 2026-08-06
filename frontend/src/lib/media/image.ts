// Client-side image pipeline for product photos. The original file is decoded
// via createImageBitmap, downscaled on a canvas (cap 2000px on the long edge),
// and re-encoded lossily. The raw file never leaves the device — only the
// re-encoded blob is uploaded, which keeps payloads small and strips any
// embedded metadata.
const MAX_DIM = 2000
const QUALITY = 0.82

function canvasToBlob(
  canvas: HTMLCanvasElement,
  type: string,
  quality: number
): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality))
}

function downscale(bitmap: ImageBitmap): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const scale = Math.min(1, MAX_DIM / Math.max(bitmap.width, bitmap.height))
  const width = Math.max(1, Math.round(bitmap.width * scale))
  const height = Math.max(1, Math.round(bitmap.height * scale))
  const canvas = document.createElement("canvas")
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext("2d")
  if (!ctx) {
    throw new Error("Canvas 2D is not available in this browser.")
  }
  ctx.drawImage(bitmap, 0, 0, width, height)
  return [canvas, ctx]
}

// AVIF is smaller than WebP at the same quality, but only Chromium's encoder
// is trustworthy in the browser. Probe it: an unsupported type makes the
// canvas fall back to PNG, so accept the blob only when it really is AVIF.
export async function encodeProductImage(file: File): Promise<Blob> {
  if (typeof createImageBitmap === "undefined") {
    throw new Error("This browser can't process images here.")
  }
  const bitmap = await createImageBitmap(file)
  try {
    const [canvas] = downscale(bitmap)

    const webp = await canvasToBlob(canvas, "image/webp", QUALITY)
    if (!webp) {
      throw new Error("Could not encode the image.")
    }

    const avif = await canvasToBlob(canvas, "image/avif", QUALITY)
    if (avif && avif.type === "image/avif") {
      return avif
    }
    return webp
  } finally {
    bitmap.close()
  }
}

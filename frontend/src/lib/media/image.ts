// Client-side image pipeline for product photos. The original file is decoded
// via createImageBitmap, downscaled on a canvas (cap 1600px on the long edge),
// and re-encoded lossily. The raw file never leaves the device — only the
// re-encoded blob is uploaded, which keeps payloads small and strips any
// embedded metadata.
const MAX_INPUT_BYTES = 30 * 1024 * 1024
const MAX_PIXELS = 40_000_000
const MAX_DIM = 1600
const QUALITY = 0.8

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

export async function encodeProductImage(file: File): Promise<Blob> {
  if (!/^image\/(jpeg|png|webp|avif)$/i.test(file.type)) {
    throw new Error("Choose a JPEG, PNG, WebP, or AVIF image.")
  }
  if (file.size > MAX_INPUT_BYTES) {
    throw new Error("Choose an image smaller than 30 MB.")
  }
  if (typeof createImageBitmap === "undefined") {
    throw new Error("This device can't prepare that image. Try a smaller photo.")
  }
  const bitmap = await createImageBitmap(file, {
    imageOrientation: "from-image",
    premultiplyAlpha: "default",
  })
  try {
    if (bitmap.width * bitmap.height > MAX_PIXELS) {
      throw new Error("That image is too large to process safely. Choose a smaller photo.")
    }
    const [canvas] = downscale(bitmap)

    const webp = await canvasToBlob(canvas, "image/webp", QUALITY)
    if (!webp) {
      throw new Error("Could not encode the image.")
    }

    return webp
  } finally {
    bitmap.close()
  }
}

"use server"

import { MEDUSA_BACKEND_URL } from "@lib/config"
import { getSellerAuthHeaders } from "./seller-cookies"

const IMAGE_MAX_BYTES = 10 * 1024 * 1024
const VIDEO_MAX_BYTES = 40 * 1024 * 1024

export type UploadMediaResult = {
  url?: string
  error?: string
}

const friendlyUploadError = (value: unknown, fallback = "We couldn't upload that file right now. Please try again shortly.") => {
  const message = String(value ?? "").trim()
  // Edge protection pages are HTML, not API errors. Never render their
  // challenge markup or headers inside the seller workspace.
  if (
    !message ||
    /<!doctype html|<html|just a moment|cloudflare|challenge-platform|unknown error/i.test(message)
  ) {
    return fallback
  }
  return message.replace(/^Error:\s*/i, "")
}

// Uploads a client-encoded blob (WebP/AVIF image, or MP4 video) to the
// backend's seller upload endpoint. The seller JWT lives in an httpOnly cookie,
// so this runs as a server action where the cookie is readable; the browser
// never handles the raw file bytes across the wire beyond the encoding step.
export const uploadSellerMedia = async (
  file: File,
  kind: "image" | "video"
): Promise<UploadMediaResult> => {
  try {
    const headers = await getSellerAuthHeaders()
    if (!("authorization" in headers)) {
      return { error: "Not signed in as a seller." }
    }

    const maxBytes = kind === "image" ? IMAGE_MAX_BYTES : VIDEO_MAX_BYTES
    if (file.size > maxBytes) {
      return { error: `File too large — max ${maxBytes / 1024 / 1024}MB` }
    }

    const form = new FormData()
    form.append("file", file, file.name)
    form.append("kind", kind)

    const res = await fetch(`${MEDUSA_BACKEND_URL}/sellers/uploads`, {
      method: "POST",
      headers: headers as Record<string, string>,
      body: form,
    })

    if (!res.ok) {
      const text = await res.text().catch(() => "")
      return { error: friendlyUploadError(text) }
    }

    const contentType = res.headers.get("content-type") || ""
    if (!contentType.toLowerCase().includes("application/json")) {
      return { error: friendlyUploadError(null) }
    }

    const data = (await res.json()) as { url?: string }
    return { url: data.url }
  } catch (error: any) {
    return { error: friendlyUploadError(error?.message) }
  }
}

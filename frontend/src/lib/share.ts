"use client"

type ShareTarget =
  | "whatsapp"
  | "x"
  | "facebook"
  | "linkedin"
  | "telegram"
  | "pinterest"
  | "sms"
  | "email"
  | "copy"

type SharePayload = {
  url: string
  text: string
  title?: string
  description?: string
  image?: string
  hashtags?: string[]
  handle?: string
}

/**
 * Message people actually receive: title + short text + link, so a share is
 * never a bare URL. Upstream apps render a rich visual preview from the OG
 * tags on the destination page.
 */
const buildShareMessage = (payload: SharePayload) => {
  const parts = [
    payload.text || payload.title,
    payload.description && payload.description !== payload.text
      ? payload.description
      : undefined,
    payload.url,
  ].filter((part): part is string => Boolean(part?.trim()))

  return parts.join("\n\n")
}

const enc = (s: string) => encodeURIComponent(s)

const buildLinks = (payload: SharePayload) => {
  const text = `${payload.text}\n${payload.url}`
  const hashtags = (payload.hashtags ?? []).join(",")
  const via = payload.handle ? payload.handle : undefined

  return {
    whatsapp: `https://api.whatsapp.com/send?text=${enc(text)}`,
    x: `https://twitter.com/intent/tweet?text=${enc(payload.text)}${hashtags ? `&hashtags=${enc(hashtags)}` : ""}${via ? `&via=${enc(via)}` : ""}&url=${enc(payload.url)}`,
    facebook: `https://www.facebook.com/sharer/sharer.php?u=${enc(payload.url)}`,
    linkedin: `https://www.linkedin.com/sharing/share-offsite/?url=${enc(payload.url)}`,
    telegram: `https://t.me/share/url?url=${enc(payload.url)}&text=${enc(payload.text)}`,
    pinterest: payload.image
      ? `https://www.pinterest.com/pin/create/button/?url=${enc(payload.url)}&media=${enc(payload.image)}&description=${enc(payload.text)}`
      : null,
    sms: `sms:?&body=${enc(text)}`,
    email: `mailto:?subject=${enc(payload.title ?? "Shared with you")}&body=${enc(text)}`,
  }
}

const openLink = (url: string) => {
  window.open(url, "_blank", "noopener,noreferrer")
}

type FireShareEventInput = {
  entity: string
  entityId?: string
  channel: ShareTarget | "native"
}

const fireShareEvent = ({ entity, entityId, channel }: FireShareEventInput) => {
  try {
    navigator.sendBeacon(
      "/api/share-evt",
      new Blob([JSON.stringify({ entity, entityId, channel })], {
        type: "application/json",
      })
    )
  } catch {
    /* beacon is best-effort */
  }
}

const isWebShareSupported = () =>
  typeof navigator !== "undefined" &&
  typeof navigator.share === "function" &&
  window.isSecureContext

type ShareResult = { status: "native" | "link" | "copy" | "cancelled"; channel?: ShareTarget }

const copyText = async (text: string): Promise<boolean> => {
  if (navigator.clipboard && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(text)
      return true
    } catch {
      /* fall through to legacy */
    }
  }
  try {
    const ta = document.createElement("textarea")
    ta.value = text
    ta.style.cssText = "position:fixed;opacity:0"
    document.body.appendChild(ta)
    ta.select()
    const ok = document.execCommand("copy")
    ta.remove()
    return ok
  } catch {
    return false
  }
}

const shareViaNative = async (payload: SharePayload): Promise<ShareResult> => {
  if (!isWebShareSupported()) return { status: "cancelled" }
  try {
    await navigator.share({
      title: payload.title,
      text: [payload.text, payload.description]
        .filter((part): part is string => Boolean(part?.trim()))
        .join("\n\n"),
      url: payload.url,
    })
    return { status: "native" }
  } catch (err) {
    if ((err as Error).name === "AbortError") return { status: "cancelled" }
    return { status: "cancelled" }
  }
}

export type { ShareTarget, SharePayload, ShareResult }
export {
  buildLinks,
  buildShareMessage,
  openLink,
  fireShareEvent,
  copyText,
  shareViaNative,
  isWebShareSupported,
}

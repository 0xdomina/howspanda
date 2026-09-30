// Telegram seller secretary — conversational state + helpers.
// Phase 1: in-memory 10-min sessions per chat (single-instance safe, no DB
// migration). Payouts are deliberately excluded: any payout/withdrawal ask
// gets a redirect reply, never an action.

import { randomUUID } from "crypto"
import { mkdir, writeFile } from "fs/promises"
import path from "path"
import { Modules } from "@medusajs/framework/utils"
import { sniffMedia } from "../upload/sniff"

export type NewProductDraft = {
  title?: string
  priceMajor?: number
  stock?: number
  description?: string
  categoryId?: string
  categoryName?: string
  photos: string[]
}

export type SecretaryStep =
  | "idle"
  | "new_title"
  | "new_price"
  | "new_stock"
  | "new_photos"
  | "new_description"
  | "new_category"
  | "new_confirm"
  | "edit_pick"
  | "edit_field"
  | "edit_value"
  | "edit_category"
  | "edit_photo"

export type EditField =
  | "title"
  | "price"
  | "stock"
  | "category"
  | "description"
  | "status"
  | "photo"

export type SecretarySession = {
  chatId: string
  sellerId: string
  sellerAdminId: string
  storeName: string
  step: SecretaryStep
  draft: NewProductDraft
  edit?: {
    list: { id: string; title: string }[]
    productId?: string
    productTitle?: string
    field?: EditField
  }
  expiresAt: number
}

const SESSION_TTL_MS = 10 * 60 * 1000
const sessions = new Map<string, SecretarySession>()

export function getSecretarySession(chatId: string): SecretarySession | null {
  const s = sessions.get(chatId)
  if (!s) return null
  if (s.expiresAt < Date.now()) {
    sessions.delete(chatId)
    return null
  }
  return s
}

export function startSecretarySession(input: {
  chatId: string
  sellerId: string
  sellerAdminId: string
  storeName: string
  step: SecretaryStep
}): SecretarySession {
  const s: SecretarySession = {
    ...input,
    step: input.step,
    draft: { photos: [] },
    expiresAt: Date.now() + SESSION_TTL_MS,
  }
  sessions.set(input.chatId, s)
  return s
}

export function touchSecretarySession(s: SecretarySession): SecretarySession {
  s.expiresAt = Date.now() + SESSION_TTL_MS
  sessions.set(s.chatId, s)
  return s
}

export function clearSecretarySession(chatId: string): void {
  sessions.delete(chatId)
}

export const SECRETARY_HELP = [
  `I am your store secretary.`,
  ``,
  `/products. Your products with prices and stock.`,
  `/new. Create a product step by step.`,
  `/edit. Change price, stock, photo or details.`,
  `/orders. Latest orders with escrow status.`,
  `/store. Store summary and Manage Business link.`,
  `/cancel. Stop what we are doing.`,
  `/unlink. Disconnect this chat from the store.`,
  ``,
  `Payouts and bank accounts live in Manage Business only.`,
].join("\n")

export const PAYOUT_REDIRECT = [
  `I never move money from chat.`,
  `Open Manage Business, then Payouts.`,
].join("\n")

export function isPayoutAsk(text: string): boolean {
  return /payout|withdraw|bank account|payout_account|account number/i.test(text)
}

/** Accepts "2500", "₦2,500", "2,500.50" → major Naira, or null. */
export function parsePriceMajor(raw: string): number | null {
  const cleaned = raw
    .replace(/[₦\s]/g, "")
    .replace(/,/g, "")
    .replace(/^(NGN|ngn)/, "")
    .trim()
  if (!cleaned || !/^\d+(\.\d{1,2})?$/.test(cleaned)) return null
  const major = Number(cleaned)
  if (!Number.isFinite(major) || major <= 0 || major > 100_000_000) return null
  return Math.round(major * 100) / 100
}

export function formatNgnMajor(major: number): string {
  return `₦${major.toLocaleString("en-NG", { minimumFractionDigits: major % 1 ? 2 : 0 })}`
}

export function newProductSummary(d: NewProductDraft): string {
  const lines = [`Please confirm this product:`]
  lines.push(``, `Title: ${d.title ?? "—"}`)
  lines.push(`Price: ${d.priceMajor != null ? formatNgnMajor(d.priceMajor) : "—"}`)
  lines.push(`Stock: ${d.stock != null ? d.stock : "—"}`)
  lines.push(`Category: ${d.categoryName ?? "—"}`)
  lines.push(`Photos: ${d.photos.length ? `${d.photos.length} attached` : "none"}`)
  lines.push(`Description: ${d.description || "—"}`)
  lines.push(``, `Reply YES to publish, or /cancel to discard.`)
  return lines.join("\n")
}

export const EDIT_FIELD_PROMPT =
  `What should change? Reply with one: title, price, stock, category, photo, description, status.`

/** Normalizes "Title" / "PRICE" / "photo " → field, or null. */
export function normalizeEditField(raw: string): EditField | null {
  const t = raw.trim().toLowerCase()
  if (t === "title" || t === "name") return "title"
  if (t === "price") return "price"
  if (t === "stock" || t === "quantity" || t === "qty") return "stock"
  if (t === "category" || t === "categories" || t === "aisle") return "category"
  if (t === "photo" || t === "picture" || t === "image") return "photo"
  if (t === "description" || t === "desc") return "description"
  if (t === "status" || t === "visibility" || t === "publish") return "status"
  return null
}

/** Accepts publish/published, draft, archive/archived/hide → workflow status. */
export function parseStatusValue(raw: string): "published" | "draft" | null {
  const t = raw.trim().toLowerCase()
  if (t === "publish" || t === "published" || t === "live" || t === "show")
    return "published"
  if (
    t === "draft" ||
    t === "hide" ||
    t === "hidden" ||
    t === "archive" ||
    t === "archived"
  )
    return "draft"
  return null
}

const FILE_TIMEOUT_MS = 20_000

function botToken(): string | null {
  return process.env.TELEGRAM_BOT_TOKEN || null
}

/** Largest photo file_id from a Telegram message, if any. */
export function largestPhotoFileId(msg: {
  photo?: { file_id?: string; file_size?: number }[]
}): string | null {
  const photos = msg?.photo ?? []
  if (!photos.length) return null
  const sorted = [...photos].sort(
    (a, b) => (b.file_size ?? 0) - (a.file_size ?? 0)
  )
  return sorted[0]?.file_id ?? null
}

async function telegramGetFilePath(fileId: string): Promise<string | null> {
  const token = botToken()
  if (!token) return null
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/getFile`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ file_id: fileId }),
      signal: AbortSignal.timeout(FILE_TIMEOUT_MS),
    })
    if (!res.ok) return null
    const body = (await res.json().catch(() => null)) as {
      ok?: boolean
      result?: { file_path?: string }
    } | null
    return body?.ok ? (body.result?.file_path ?? null) : null
  } catch {
    return null
  }
}

export async function downloadTelegramFile(fileId: string): Promise<Buffer | null> {
  const token = botToken()
  if (!token) return null
  const filePath = await telegramGetFilePath(fileId)
  if (!filePath) return null
  try {
    const res = await fetch(
      `https://api.telegram.org/file/bot${token}/${filePath}`,
      { signal: AbortSignal.timeout(FILE_TIMEOUT_MS) }
    )
    if (!res.ok) return null
    return Buffer.from(await res.arrayBuffer())
  } catch {
    return null
  }
}

/**
 * Store a Telegram photo through the same pipeline as seller uploads: sniff
 * bytes, upload via FILE service (S3/B2) when configured, else local disk.
 * Returns the product-ready URL or null.
 */
export async function storeTelegramPhoto(
  buffer: Buffer,
  scope: { resolve(name: string): unknown }
): Promise<string | null> {
  if (buffer.length > 10 * 1024 * 1024) return null
  let sniffed: { kind: string; ext: string; mime: string }
  try {
    sniffed = sniffMedia(buffer)
  } catch {
    return null
  }
  if (sniffed.kind !== "image" || sniffed.ext === "gif") return null

  if (
    process.env.S3_BUCKET &&
    process.env.S3_ACCESS_KEY_ID &&
    process.env.S3_SECRET_ACCESS_KEY
  ) {
    try {
      const fileService = scope.resolve(Modules.FILE) as unknown as {
        upload(input: {
          filename: string
          mimeType: string
          content: string
          access: "private"
        }): Promise<{ url: string }>
      }
      const uploaded = await fileService.upload({
        filename: `${randomUUID()}.${sniffed.ext}`,
        mimeType: sniffed.mime,
        content: buffer.toString("base64"),
        access: "private",
      })
      return uploaded.url
    } catch {
      return null
    }
  }

  try {
    const filename = `${randomUUID()}.${sniffed.ext}`
    const root = path.resolve(process.cwd(), "uploads")
    const dir = path.join(root, "image")
    const target = path.resolve(dir, filename)
    if (target !== root && !target.startsWith(root + path.sep)) return null
    await mkdir(dir, { recursive: true })
    await writeFile(target, buffer)
    return `/uploads/image/${filename}`
  } catch {
    return null
  }
}

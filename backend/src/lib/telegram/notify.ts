// Telegram order alerts for sellers — Bot API, no SDK needed.
// One bot, free tier, no daily cap at our scale (Bot API allows ~30 msg/s).
// Linking is per store: owner generates a one-time code in seller settings,
// opens t.me/<bot>?start=<code>, taps Start; the webhook below binds the
// store to that Telegram chat. Raw phone numbers can NOT be messaged — the
// handshake is what turns a phone owner into a reachable chat.

const API_TIMEOUT_MS = 8_000

function botToken(): string | null {
  return process.env.TELEGRAM_BOT_TOKEN || null
}

async function botApi<T>(
  method: string,
  payload: Record<string, unknown>
): Promise<T | null> {
  const token = botToken()
  if (!token) return null
  try {
    const res = await fetch(
      `https://api.telegram.org/bot${token}/${method}`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(API_TIMEOUT_MS),
      }
    )
    if (!res.ok) return null
    const body = (await res.json().catch(() => null)) as {
      ok?: boolean
      result?: T
    } | null
    return body?.ok ? (body.result as T) : null
  } catch {
    return null
  }
}

export function telegramConfigured(): boolean {
  return Boolean(botToken())
}

let cachedBotUsername: string | null = null

export async function telegramBotUsername(): Promise<string | null> {
  if (cachedBotUsername) return cachedBotUsername
  if (process.env.TELEGRAM_BOT_USERNAME) {
    cachedBotUsername = process.env.TELEGRAM_BOT_USERNAME.replace(/^@/, "")
    return cachedBotUsername
  }
  const me = await botApi<{ username?: string }>("getMe", {})
  if (me?.username) {
    cachedBotUsername = me.username
    return cachedBotUsername
  }
  return null
}

export function telegramDeepLink(botUsername: string, code: string): string {
  return `https://t.me/${botUsername}?start=${encodeURIComponent(code)}`
}

/** Best-effort order alert. Never throws — a failed ping must not fail orders. */
export async function notifySellerNewOrder(input: {
  chatId: string
  storeName: string
  orderDisplayId: string | number
  itemCount: number
  totalFormatted: string
  buyerEmail?: string | null
  manageUrl: string
}): Promise<boolean> {
  const lines = [
    `New order for ${input.storeName}`,
    ``,
    `Order ${input.orderDisplayId} · ${input.itemCount} item${input.itemCount === 1 ? "" : "s"} · ${input.totalFormatted}`,
  ]
  if (input.buyerEmail) lines.push(`Buyer: ${input.buyerEmail}`)
  lines.push(``, `It needs your attention — please confirm and fulfil it in your seller workspace.`)
  const sent = await botApi<{ message_id?: number }>("sendMessage", {
    chat_id: input.chatId,
    text: lines.join("\n"),
    reply_markup: {
      inline_keyboard: [[{ text: "Open seller orders", url: input.manageUrl }]],
    },
  })
  return Boolean(sent)
}

export async function notifyTelegramLinked(input: {
  chatId: string
  storeName: string
}): Promise<void> {
  await botApi("sendMessage", {
    chat_id: input.chatId,
    text: [
      `${input.storeName} is linked for order alerts.`,
      ``,
      `You will get a message here the moment a new order needs your attention.`,
      `Send /help to see what I can do as your store secretary.`,
    ].join("\n"),
  })
}

/** Best-effort plain reply for the secretary. Never throws. */
export async function sendTelegramText(
  chatId: number | string,
  text: string,
  extra?: Record<string, unknown>
): Promise<boolean> {
  const sent = await botApi<{ message_id?: number }>("sendMessage", {
    chat_id: chatId,
    text,
    ...(extra ?? {}),
  })
  return Boolean(sent)
}

/** Best-effort photo message (e.g. a payment receipt). Never throws. */
export async function sendTelegramPhoto(
  chatId: number | string,
  photoUrl: string,
  caption: string,
  extra?: Record<string, unknown>
): Promise<boolean> {
  const sent = await botApi<{ message_id?: number }>("sendPhoto", {
    chat_id: chatId,
    photo: photoUrl,
    caption,
    ...(extra ?? {}),
  })
  return Boolean(sent)
}

/**
 * Payment-gated order alert: fires when the buyer SUBMITS transfer proof
 * (not at order creation — no money has moved before that). The receipt
 * rides along as the photo so the seller can verify at a glance.
 */
export async function notifySellerProofSubmitted(input: {
  chatId: string
  storeName: string
  orderDisplayId: string | number
  itemCount: number
  totalFormatted: string
  buyerEmail?: string | null
  reference: string
  receiptUrl?: string | null
  manageUrl: string
}): Promise<boolean> {
  const lines = [
    `Payment proof for ${input.storeName}`,
    ``,
    `Order ${input.orderDisplayId} · ${input.itemCount} item${input.itemCount === 1 ? "" : "s"} · ${input.totalFormatted}`,
    `Reference: ${input.reference}`,
  ]
  if (input.buyerEmail) lines.push(`Buyer: ${input.buyerEmail}`)
  lines.push(
    ``,
    `The buyer tapped "I've made this transfer" — check the receipt and confirm or reject in your seller workspace.`
  )
  const caption = lines.join("\n")
  const keyboard = {
    reply_markup: {
      inline_keyboard: [[{ text: "Review proof", url: input.manageUrl }]],
    },
  }
  if (input.receiptUrl) {
    const withPhoto = await sendTelegramPhoto(input.chatId, input.receiptUrl, caption, keyboard)
    if (withPhoto) return true
    // Photo send failed (URL expired, file too big) — the text must still land.
  }
  return sendTelegramText(input.chatId, caption, keyboard)
}

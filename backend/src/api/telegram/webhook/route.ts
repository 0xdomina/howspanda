import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import MarketplaceModuleService from "../../../modules/marketplace/service"
import { MARKETPLACE_MODULE } from "../../../modules/marketplace"
import { notifyTelegramLinked } from "../../../lib/telegram/notify"

// Public Telegram webhook (set via setWebhook with TELEGRAM_WEBHOOK_SECRET).
// Handles the one-time link handshake: owner taps Start on
// t.me/<bot>?start=<code> → we bind their chat to the store and confirm.
type TelegramUpdate = {
  message?: {
    chat?: { id?: number | string }
    text?: string
  }
}

export const POST = async (req: MedusaRequest, res: MedusaResponse) => {
  const configuredSecret = process.env.TELEGRAM_WEBHOOK_SECRET
  if (configuredSecret) {
    const presented =
      (req.headers["x-telegram-bot-api-secret-token"] as string | undefined) ??
      ""
    if (presented !== configuredSecret) {
      res.status(401).json({ ok: false })
      return
    }
  }

  const update = (req.body ?? {}) as TelegramUpdate
  const chatId = update.message?.chat?.id
  const text = (update.message?.text ?? "").trim()

  // Always 200 quickly — Telegram retries anything else, and retries of a
  // consumed link code must stay harmless.
  if (!chatId || !text.startsWith("/start")) {
    res.json({ ok: true })
    return
  }

  const code = text.replace(/^\/start\s*/, "").trim()
  if (!code) {
    await reply(
      chatId,
      "Welcome! To link order alerts, generate a link code in your seller settings (Manage Business → Store settings → Order alerts) and tap its button."
    )
    res.json({ ok: true })
    return
  }

  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const { data: [seller] } = (await query.graph({
    entity: "seller",
    fields: ["id", "name", "telegram_link_code", "telegram_link_expires_at"],
    filters: { telegram_link_code: [code] } as any,
  })) as { data: any[] }

  const fresh =
    seller &&
    (seller as any).telegram_link_expires_at &&
    new Date((seller as any).telegram_link_expires_at).getTime() > Date.now()

  if (!fresh) {
    await reply(
      chatId,
      "That link code expired or was already used. Generate a fresh one in seller settings → Order alerts and try again."
    )
    res.json({ ok: true })
    return
  }

  const marketplace: MarketplaceModuleService =
    req.scope.resolve(MARKETPLACE_MODULE)
  await marketplace.updateSellers({
    id: seller.id,
    telegram_chat_id: String(chatId),
    telegram_link_code: null,
    telegram_link_expires_at: null,
  })

  await notifyTelegramLinked({
    chatId: String(chatId),
    storeName: (seller as any).name ?? "Your store",
  })
  res.json({ ok: true })
}

async function reply(chatId: number | string, text: string) {
  const token = process.env.TELEGRAM_BOT_TOKEN
  if (!token) return
  try {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text }),
      signal: AbortSignal.timeout(10_000),
    })
  } catch {
    // Greeted with silence — the JSON ok:true above is what matters.
  }
}

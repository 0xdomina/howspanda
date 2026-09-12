import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { randomBytes } from "crypto"
import MarketplaceModuleService from "../../../../modules/marketplace/service"
import { MARKETPLACE_MODULE } from "../../../../modules/marketplace"
import { requireSellerOwner } from "../../../../lib/sellers/resolve-seller"
import {
  telegramBotUsername,
  telegramConfigured,
  telegramDeepLink,
} from "../../../../lib/telegram/notify"

const LINK_TTL_MS = 15 * 60 * 1000

// Owner mints a one-time Telegram link: seller settings shows the deep link,
// the owner taps Start in Telegram, the webhook binds the chat to the store.
// 410-style gating: without a bot token configured this explains itself.
export const POST = async (
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) => {
  const context = await requireSellerOwner(req)

  if (!telegramConfigured()) {
    res.status(503).json({
      message:
        "Telegram alerts are not configured yet. Please try again shortly.",
    })
    return
  }

  const code = randomBytes(9).toString("base64url").slice(0, 12)
  const expiresAt = new Date(Date.now() + LINK_TTL_MS)

  const marketplace: MarketplaceModuleService =
    req.scope.resolve(MARKETPLACE_MODULE)
  await marketplace.updateSellers({
    id: context.sellerId,
    telegram_link_code: code,
    telegram_link_expires_at: expiresAt,
  })

  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const { data: [seller] } = await query.graph({
    entity: "seller",
    fields: ["id", "name", "telegram_chat_id"],
    filters: { id: [context.sellerId] },
  }) as { data: any[] }

  const botUsername = await telegramBotUsername()

  res.json({
    linked: Boolean((seller as any)?.telegram_chat_id),
    store_name: (seller as any)?.name ?? "Your store",
    code,
    deep_link: botUsername ? telegramDeepLink(botUsername, code) : null,
    bot_username: botUsername,
    expires_at: expiresAt.toISOString(),
  })
}

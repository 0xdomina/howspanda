import { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { MARKETPLACE_MODULE } from "../modules/marketplace"
import MarketplaceModuleService from "../modules/marketplace/service"
import {
  sendTelegramText,
  telegramConfigured,
} from "../lib/telegram/notify"

const REMIND_AFTER_MS = 60 * 60 * 1000

// Hourly nudge: transfer proofs sitting in `submitted` for over an hour get
// one Telegram reminder each to the linked store. Keeps paid buyers from
// waiting on a seller who missed the submit ping. Best-effort throughout.
export default async function remindUnconfirmedProofsJob(
  container: MedusaContainer
) {
  const marketplace =
    container.resolve<MarketplaceModuleService>(MARKETPLACE_MODULE)
  const submitted = await marketplace.listPaymentProofs(
    { status: "submitted" } as any,
    { take: 100, order: { submitted_at: "ASC" } } as any
  )
  const due = (submitted ?? []).filter((p: any) => {
    const at = p?.submitted_at ? new Date(p.submitted_at).getTime() : 0
    return at > 0 && Date.now() - at >= REMIND_AFTER_MS
  })
  if (!due.length || !telegramConfigured()) return

  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const sellerIds = [...new Set(due.map((p: any) => p.seller_id).filter(Boolean))]
  const { data: sellers } = (await query.graph({
    entity: "seller",
    fields: ["id", "name", "telegram_chat_id"],
    filters: { id: sellerIds },
  }).catch(() => ({ data: [] }))) as { data: any[] }
  const bySeller = new Map((sellers ?? []).map((s: any) => [s.id, s]))
  const storefront = (process.env.STOREFRONT_URL || "https://hows-u.vercel.app").replace(/\/$/, "")

  let reminded = 0
  for (const proof of due as any[]) {
    try {
      const seller = bySeller.get(proof.seller_id)
      if (!seller?.telegram_chat_id) continue
      const { data: [order] } = (await query.graph({
        entity: "order",
        fields: ["id", "display_id", "total", "currency_code"],
        filters: { id: [proof.order_id] },
      }).catch(() => ({ data: [] }))) as { data: any[] }
      const major = Number(order?.total ?? proof.amount ?? 0) / 100
      const total = `${order?.currency_code?.toUpperCase() ?? "NGN"} ${major.toLocaleString("en-NG", { minimumFractionDigits: 2 })}`
      const sent = await sendTelegramText(
        seller.telegram_chat_id as string,
        [
          `Order ${order?.display_id ?? proof.order_id} still needs your verdict.`,
          `Buyer paid ${total}. Open Manage Business to confirm.`,
        ].join("\n"),
        {
          reply_markup: {
            inline_keyboard: [
              [{ text: "Review proof", url: `${storefront}/ng/seller/orders` }],
            ],
          },
        }
      ).catch(() => false)
      if (sent) reminded += 1
    } catch {
      // One bad proof never blocks the rest.
    }
  }

  logger.info(`remind-unconfirmed-proofs: ${reminded}/${due.length} reminded`)
}

export const config = {
  name: "remind-unconfirmed-proofs",
  schedule: "30 * * * *",
}

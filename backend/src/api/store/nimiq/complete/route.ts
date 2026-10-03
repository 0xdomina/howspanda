import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils"
import createSellerOrdersWorkflow from "../../../../workflows/marketplace/create-seller-orders"
import { NIMIQ_MODULE } from "../../../../modules/nimiq"
import type NimiqModuleService from "../../../../modules/nimiq/service"
import {
  notifySellerNewOrder,
  telegramConfigured,
} from "../../../../lib/telegram/notify"
import { appendCommerceEvent } from "../../../../lib/rialo/audit"

// Settle a chain-paid quote into a real marketplace order: escrow lines,
// commission split, and seller notification all ride the standard flow.
// Platform-held settlement: funds sit at the merchant wallet until release,
// so refunds stay possible (approved returns are new transfers).
export const POST = async (req: MedusaRequest, res: MedusaResponse) => {
  const body = (req.body ?? {}) as { quote_id?: string }
  if (!body.quote_id) {
    throw new MedusaError(MedusaError.Types.INVALID_DATA, "Quote needed")
  }
  const nimiq: NimiqModuleService = req.scope.resolve(NIMIQ_MODULE)
  const quote = await nimiq.getQuote(body.quote_id)
  if (!quote || quote.status !== "paid") {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "Quote is not paid"
    )
  }
  if ((quote as any).order_id) {
    return res.json({ order_id: (quote as any).order_id, replayed: true })
  }
  const cartId = (quote as any).cart_id as string | null
  if (!cartId) {
    throw new MedusaError(MedusaError.Types.INVALID_DATA, "Quote has no cart")
  }

  const { result } = await createSellerOrdersWorkflow(req.scope).run({
    input: { cart_id: cartId },
  })
  await nimiq.updateNimiqQuotes([
    { id: quote.id, order_id: result.order.id },
  ] as any).catch(() => null)

  // Best-effort Rialo DevNet audit trail. Never throws, never blocks.
  try {
    void appendCommerceEvent({
      kind: "order-paid",
      ref: result.order.id,
      payload: {
        order_id: result.order.id,
        quote_id: quote.id,
        reference: (quote as any).reference ?? null,
      },
    }).catch(() => null)
  } catch {
    // Audit never fails orders.
  }

  // Payment is proven on chain, so the seller hears immediately (mirrors
  // instant rails — never the bank-transfer wait-for-proof path).
  try {
    if (telegramConfigured()) {
      const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
      const { data: [placedOrder] } = (await query.graph({
        entity: "order",
        fields: [
          "id",
          "display_id",
          "email",
          "total",
          "currency_code",
          "items.quantity",
          "items.product.seller.id",
        ],
        filters: { id: result.order.id },
      })) as { data: any[] }
      const counts = new Map<string, number>()
      for (const item of ((placedOrder as any)?.items ?? []) as any[]) {
        const sid = item?.product?.seller?.id as string | undefined
        if (sid) counts.set(sid, (counts.get(sid) ?? 0) + (Number(item.quantity) || 1))
      }
      if (counts.size > 0) {
        const { data: sellers } = await query.graph({
          entity: "seller",
          fields: ["id", "name", "telegram_chat_id"],
          filters: { id: [...counts.keys()] },
        })
        const major = Number((placedOrder as any)?.total ?? 0) / 100
        const totalFormatted = `${((placedOrder as any)?.currency_code ?? "NGN").toUpperCase()} ${major.toLocaleString("en-NG", { minimumFractionDigits: 2 })}`
        const storefront = (process.env.STOREFRONT_URL || "https://hows-u.vercel.app").replace(/\/$/, "")
        await Promise.all(
          (sellers ?? [])
            .filter((s: any) => s?.telegram_chat_id)
            .map((s: any) =>
              notifySellerNewOrder({
                chatId: s.telegram_chat_id as string,
                storeName: s.name ?? "Your store",
                orderDisplayId: (placedOrder as any)?.display_id ?? result.order.id,
                itemCount: counts.get(s.id) ?? 0,
                totalFormatted,
                buyerEmail: (placedOrder as any)?.email,
                manageUrl: `${storefront}/ng/seller/orders`,
              }).catch(() => false)
            )
        )
      }
    }
  } catch {
    // Alerts never fail orders.
  }

  res.json({ order_id: result.order.id, reference: (quote as any).reference })
}

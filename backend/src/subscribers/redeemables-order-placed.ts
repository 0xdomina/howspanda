import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import {
  ContainerRegistrationKeys,
  OrderWorkflowEvents,
} from "@medusajs/framework/utils"
import { REDEEMABLES_MODULE } from "../modules/redeemables"
import RedeemablesModuleService from "../modules/redeemables/service"
import { MARKETPLACE_MODULE } from "../modules/marketplace"
import MarketplaceModuleService from "../modules/marketplace/service"

// Sold instruments come to life here: each purchased template unit mints a
// fresh coded instance addressed to the buyer, and redeemable-only seller
// orders release escrow instantly (locked Phase 7 decision). Failures are
// logged, never thrown — the order itself must always survive.
export default async function redeemablesOrderPlacedHandler({
  event: { data },
  container,
}: SubscriberArgs<{ id: string }>) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  try {
    const query = container.resolve(ContainerRegistrationKeys.QUERY)
    const { data: [order] } = await query.graph({
      entity: "order",
      fields: [
        "id",
        "email",
        "metadata",
        "items.quantity",
        "items.product_id",
      ],
      filters: { id: data.id },
    })
    if (!order || order.metadata?.parent_order_id) {
      return // child seller orders ride their parent's event
    }

    const redeemables =
      container.resolve<RedeemablesModuleService>(REDEEMABLES_MODULE)

    const already = await redeemables.listRedeemables({
      source_order_id: order.id,
    })
    if (already.length) {
      return // replayed event — never double-mint
    }

    // each item → owning seller + template linkage (if it is one)
    type ItemInfo = {
      seller_id?: string
      template_id?: string
      quantity: number
    }
    const infos: ItemInfo[] = []
    for (const item of order.items ?? []) {
      if (!item?.product_id) {
        continue
      }
      const { data: [product] } = await query.graph({
        entity: "product",
        fields: ["id", "metadata", "seller.*"],
        filters: { id: item.product_id },
      })
      infos.push({
        seller_id: product?.seller?.id,
        template_id: product?.metadata?.redeemable_template_id as
          | string
          | undefined,
        quantity: Number(item.quantity ?? 1),
      })
    }

    for (const info of infos) {
      if (info.template_id) {
        await redeemables.mintFromTemplate(info.template_id, {
          quantity: info.quantity,
          issued_to_email: order.email ?? undefined,
          source_order_id: order.id,
        })
      }
    }

    // instant release: a seller order made ONLY of redeemables has nothing
    // to deliver — its money goes available now; mixed orders keep the
    // normal Phase 6 escrow window
    const marketplace =
      container.resolve<MarketplaceModuleService>(MARKETPLACE_MODULE)
    const lines = await marketplace.resolveLinesForOrder(order.id)
    for (const line of lines) {
      const sellerItems = infos.filter((i) => i.seller_id === line.seller_id)
      if (sellerItems.length && sellerItems.every((i) => i.template_id)) {
        await marketplace.confirmOrderReceipt(line.order_id)
      }
    }
  } catch (e) {
    logger.warn(
      `redeemables order.placed handling failed for ${data.id}: ${e}`
    )
  }
}

export const config: SubscriberConfig = {
  event: OrderWorkflowEvents.PLACED,
}

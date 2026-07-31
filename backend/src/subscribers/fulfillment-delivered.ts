import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import {
  ContainerRegistrationKeys,
  FulfillmentWorkflowEvents,
} from "@medusajs/framework/utils"
import { MARKETPLACE_MODULE } from "../modules/marketplace"
import MarketplaceModuleService from "../modules/marketplace/service"

// Core admin fulfillment delivery feeds escrow: resolve the fulfillment's
// order and start the return window on its commission lines.
export default async function fulfillmentDeliveredHandler({
  event: { data },
  container,
}: SubscriberArgs<{ id: string }>) {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const { data: fulfillments } = await query.graph({
    entity: "fulfillment",
    fields: ["id", "order.id"],
    filters: { id: data.id },
  })
  const orderId = fulfillments[0]?.order?.id
  if (!orderId) {
    return
  }
  const marketplace: MarketplaceModuleService =
    container.resolve(MARKETPLACE_MODULE)
  await marketplace.markOrderDelivered(orderId)
}

export const config: SubscriberConfig = {
  event: FulfillmentWorkflowEvents.DELIVERY_CREATED,
}

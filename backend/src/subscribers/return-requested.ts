import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import {
  ContainerRegistrationKeys,
  OrderWorkflowEvents,
} from "@medusajs/framework/utils"
import { MARKETPLACE_MODULE } from "../modules/marketplace"
import MarketplaceModuleService from "../modules/marketplace/service"

// A core return request holds escrow. CONFLICT (already released) is logged
// and swallowed so core return flows never break — released money is clawed
// back on return_received via the reversal path instead.
export default async function returnRequestedHandler({
  event: { data },
  container,
}: SubscriberArgs<{ order_id: string; return_id: string }>) {
  const marketplace: MarketplaceModuleService =
    container.resolve(MARKETPLACE_MODULE)
  try {
    await marketplace.holdForReturn(
      data.order_id,
      `return ${data.return_id} requested`
    )
  } catch (error) {
    const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
    logger.warn(
      `return-requested: could not hold escrow for order ${data.order_id}: ${
        (error as Error).message
      }`
    )
  }
}

export const config: SubscriberConfig = {
  event: OrderWorkflowEvents.RETURN_REQUESTED,
}

import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import {
  ContainerRegistrationKeys,
  OrderWorkflowEvents,
} from "@medusajs/framework/utils"
import { MARKETPLACE_MODULE } from "../modules/marketplace"
import MarketplaceModuleService from "../modules/marketplace/service"

// Goods back with the seller → the sale unwinds: reverse the commission
// line (pending/available → reversed; paid → negated clawback offset).
// Reserved lines throw CONFLICT — admin reconciles the payout first.
export default async function returnReceivedHandler({
  event: { data },
  container,
}: SubscriberArgs<{ order_id: string; return_id: string }>) {
  const marketplace: MarketplaceModuleService =
    container.resolve(MARKETPLACE_MODULE)
  try {
    await marketplace.reverseCommissionForOrder(
      data.order_id,
      `return ${data.return_id} received`
    )
  } catch (error) {
    const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
    logger.warn(
      `return-received: could not reverse commission for order ${
        data.order_id
      }: ${(error as Error).message}`
    )
  }
}

export const config: SubscriberConfig = {
  event: OrderWorkflowEvents.RETURN_RECEIVED,
}

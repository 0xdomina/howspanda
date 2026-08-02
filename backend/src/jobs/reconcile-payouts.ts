import { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import {
  reconcilePayouts,
  reconcileBuyerWithdrawals,
} from "../lib/payments/payouts/reconcile"

// Poll the rails for every `processing` payout / buyer withdrawal — the safety
// net for missed webhooks. Gated with the payout schedule so offline
// environments stay quiet.
export default async function reconcilePayoutsJob(container: MedusaContainer) {
  if (process.env.PAYOUT_SCHEDULE_ENABLED !== "true") {
    return
  }

  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)

  const [seller, buyer] = await Promise.all([
    reconcilePayouts(container),
    reconcileBuyerWithdrawals(container),
  ])

  if (seller.checked > 0 || buyer.checked > 0) {
    logger.info(
      `reconcile-payouts: seller checked ${seller.checked}, ` +
        `paid ${seller.paid}, failed ${seller.failed} | buyer checked ` +
        `${buyer.checked}, paid ${buyer.paid}, failed ${buyer.failed}`
    )
  }
}

export const config = {
  name: "reconcile-payouts",
  schedule: "*/15 * * * *",
}

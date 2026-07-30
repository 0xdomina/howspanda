import { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { reconcilePayouts } from "../lib/payments/payouts/reconcile"

// Poll the rails for every `processing` payout — the safety net for missed
// webhooks. Gated with the payout schedule so offline environments stay quiet.
export default async function reconcilePayoutsJob(container: MedusaContainer) {
  if (process.env.PAYOUT_SCHEDULE_ENABLED !== "true") {
    return
  }

  const summary = await reconcilePayouts(container)
  if (summary.checked > 0) {
    const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
    logger.info(
      `reconcile-payouts: checked ${summary.checked}, ` +
        `paid ${summary.paid}, failed ${summary.failed}`
    )
  }
}

export const config = {
  name: "reconcile-payouts",
  schedule: "*/15 * * * *",
}

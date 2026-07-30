import { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { runScheduledPayouts } from "../lib/payments/payouts/run-scheduled"

// Daily sweep of every eligible seller. Gated by PAYOUT_SCHEDULE_ENABLED so
// dev/test environments never fire real transfers by accident; admins can
// always trigger a run via POST /admin/payouts/run.
export default async function scheduledPayoutsJob(container: MedusaContainer) {
  if (process.env.PAYOUT_SCHEDULE_ENABLED !== "true") {
    return
  }

  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const result = await runScheduledPayouts(container)
  logger.info(
    `scheduled-payouts: ${result.payouts.length} payout(s), ` +
      `${result.skipped.length} skipped, ${result.failures.length} failed`
  )
}

export const config = {
  name: "scheduled-payouts",
  schedule: "0 2 * * *",
}

import { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { NOTIFICATIONS_MODULE } from "../modules/notifications"
import type NotificationsModuleService from "../modules/notifications/service"

// Delivers every due out-of-band notification through the shared transport.
// The job itself is always scheduled, but skips work (leaving rows pending)
// until NOTIFICATIONS_EMAIL_ENABLED=true — the same gate the transport uses,
// so a live deployment is a single env flip away.
export default async function drainNotificationsJob(container: MedusaContainer) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)

  if (process.env.NOTIFICATIONS_EMAIL_ENABLED !== "true") {
    return
  }

  const notifications =
    container.resolve<NotificationsModuleService>(NOTIFICATIONS_MODULE)
  const result = await notifications.drainEmail()

  if (result.attempted > 0) {
    logger.info(
      `drain-notifications: ${result.attempted} attempted, ` +
        `${result.sent} sent, ${result.failed} failed, ${result.skipped} skipped`
    )
  }
}

export const config = {
  name: "drain-notifications",
  schedule: "*/1 * * * *",
}

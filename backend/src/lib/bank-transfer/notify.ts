import { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { NOTIFICATIONS_MODULE } from "../../modules/notifications"
import NotificationsModuleService from "../../modules/notifications/service"

type BankTransferNotice = {
  to: string
  recipient: string
  kind: string
  subject: string
  bodyHtml: string
  payload?: Record<string, unknown>
}

// Best-effort out-of-band notice for bank-transfer lifecycle events. The
// notification outbox is the durable record; transport config stays out of
// the business code (see modules/notifications).
export async function sendBankTransferNotice(
  container: MedusaContainer,
  notice: BankTransferNotice
): Promise<void> {
  try {
    const notifications = container.resolve<NotificationsModuleService>(
      NOTIFICATIONS_MODULE
    )
    await notifications.enqueueEmail({
      kind: notice.kind,
      recipient: notice.recipient,
      to: notice.to,
      subject: notice.subject,
      body_html: notice.bodyHtml,
      payload: notice.payload ?? null,
    })
  } catch (error: any) {
    const logger = container.resolve(ContainerRegistrationKeys.LOGGER) as {
      warn?: (msg: string) => void
    }
    logger?.warn?.(`bank-transfer notice failed to enqueue: ${error?.message}`)
  }
}

import { MedusaService } from "@medusajs/framework/utils"
import NotificationOutbox from "./models/notification-outbox"
import { sendEmail } from "../../lib/notifications/transport"

const DEFAULT_MAX_ATTEMPTS = 5
const BACKOFF_BASE_MS = 30_000

const maxAttempts = () => {
  const parsed = Number(process.env.NOTIFICATIONS_MAX_ATTEMPTS)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_MAX_ATTEMPTS
}

export type EnqueueEmailInput = {
  kind: string
  recipient: string
  recipient_id?: string | null
  to: string
  subject?: string | null
  body_html?: string | null
  payload?: Record<string, unknown> | null
}

export type DrainResult = {
  attempted: number
  sent: number
  failed: number
  skipped: number
}

class NotificationsModuleService extends MedusaService({
  NotificationOutbox,
}) {
  /** Persists one out-of-band email for the drain job to deliver. Never
   *  throws on transport config — the row is the durable record. */
  async enqueueEmail(input: EnqueueEmailInput) {
    return this.createNotificationOutboxes({
      kind: input.kind,
      channel: "email",
      recipient: input.recipient,
      recipient_id: input.recipient_id ?? null,
      to: input.to,
      subject: input.subject ?? null,
      body_html: input.body_html ?? null,
      payload: (input.payload ?? null) as Record<string, unknown> | null,
      status: "pending",
      attempts: 0,
      next_attempt_at: null,
      sent_at: null,
    })
  }

  /** Attempts delivery of every due pending row. Success → sent. Failure →
   *  attempts+1 and, until the cap, a backoff timestamp so the job skips it
   *  on subsequent runs. Rows that were never enabled for email are skipped
   *  without churn. */
  async drainEmail({ limit = 50 }: { limit?: number } = {}): Promise<DrainResult> {
    const due = await this.listNotificationOutboxes(
      {
        status: "pending",
        $or: [{ next_attempt_at: null }, { next_attempt_at: { $lte: new Date() } }],
      },
      { order: { created_at: "ASC" }, take: limit }
    )

    const result: DrainResult = { attempted: 0, sent: 0, failed: 0, skipped: 0 }

    for (const row of due) {
      if (process.env.NOTIFICATIONS_EMAIL_ENABLED !== "true") {
        // Transport off: leave the row pending; a future enablement drains it.
        result.skipped += 1
        continue
      }

      result.attempted += 1
      try {
        await sendEmail({
          to: row.to,
          subject: row.subject ?? "",
          html: row.body_html ?? "",
        })
        await this.updateNotificationOutboxes({
          id: row.id,
          status: "sent",
          sent_at: new Date(),
          last_error: null,
          next_attempt_at: null,
        })
        result.sent += 1
      } catch (error: any) {
        const attempts = row.attempts + 1
        const exhausted = attempts >= maxAttempts()
        await this.updateNotificationOutboxes({
          id: row.id,
          status: exhausted ? "failed" : "pending",
          attempts,
          last_error: error?.message ?? String(error),
          next_attempt_at: exhausted
            ? null
            : new Date(Date.now() + BACKOFF_BASE_MS * attempts),
        })
        result.failed += 1
      }
    }

    return result
  }
}

export default NotificationsModuleService

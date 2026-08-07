import { model } from "@medusajs/framework/utils"

// One row per out-of-band notification to deliver. The business code only
// ever ENQUEUES a row; the scheduled drain job (see src/jobs/) sends it via
// the shared transport and records the outcome. Status flow:
//   pending → sent   (transport succeeded)
//   pending → failed (attempts exhausted; last_error set)
//
// `kind` is a free-form template key (e.g. "team_invite") so new templates
// never require a migration. `next_attempt_at` is set after a failed send so
// the drain job skips it until the backoff elapses.
const NotificationOutbox = model.define("notification_outbox", {
  id: model.id().primaryKey(),
  kind: model.text().searchable(),
  channel: model.enum(["email"]).default("email"),
  recipient: model.text().searchable(),
  recipient_id: model.text().nullable(),
  to: model.text(),
  subject: model.text().nullable(),
  body_html: model.text().nullable(),
  payload: model.json().nullable(),
  status: model
    .enum(["pending", "sent", "failed"])
    .default("pending"),
  attempts: model.number().default(0),
  last_error: model.text().nullable(),
  next_attempt_at: model.dateTime().nullable(),
  sent_at: model.dateTime().nullable(),
})

export default NotificationOutbox

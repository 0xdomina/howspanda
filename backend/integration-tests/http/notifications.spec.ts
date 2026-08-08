import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
import { NOTIFICATIONS_MODULE } from "../../src/modules/notifications"
import type NotificationsModuleService from "../../src/modules/notifications/service"

jest.setTimeout(120 * 1000)

medusaIntegrationTestRunner({
  inApp: true,
  env: {},
  testSuite: ({ getContainer }) => {
    describe("Notification plane (outbox + transport)", () => {
      let notifications: NotificationsModuleService

      beforeAll(() => {
        notifications = getContainer().resolve(NOTIFICATIONS_MODULE)
        process.env.NOTIFICATIONS_EMAIL_ENABLED = "true"
        process.env.NOTIFICATIONS_CHANNEL = "mock"
        process.env.NOTIFICATIONS_MAX_ATTEMPTS = "2"
      })

      it("enqueues an email and drains it to sent through the mock channel", async () => {
        await notifications.enqueueEmail({
          kind: "team_invite",
          recipient: "notify-a@howsu.local",
          to: "notify-a@howsu.local",
          subject: "You've been added to Test Store",
          body_html: "<p>Welcome</p>",
        })

        const result = await notifications.drainEmail()
        expect(result.attempted).toEqual(1)
        expect(result.sent).toEqual(1)

        const [row] = await notifications.listNotificationOutboxes({
          recipient: "notify-a@howsu.local",
        })
        expect(row.status).toEqual("sent")
        expect(row.sent_at).not.toBeNull()
      })

      it("sends multiple queued rows in created order and reports the batch", async () => {
        for (let i = 0; i < 3; i++) {
          await notifications.enqueueEmail({
            kind: "test_batch",
            recipient: `notify-batch-${i}@howsu.local`,
            to: `notify-batch-${i}@howsu.local`,
            subject: `Batch ${i}`,
          })
        }

        const result = await notifications.drainEmail()
        expect(result.attempted).toEqual(3)
        expect(result.sent).toEqual(3)

        const rows = await notifications.listNotificationOutboxes(
          { kind: "test_batch" },
          { order: { created_at: "ASC" } }
        )
        expect(rows.map((r) => r.status)).toEqual(["sent", "sent", "sent"])
      })

      it("tracks failures with attempts and backoff until the cap flips the row to failed", async () => {
        // Point the transport at a misconfigured email channel so it throws.
        const prevChannel = process.env.NOTIFICATIONS_CHANNEL
        delete process.env.EMAIL_API_KEY
        process.env.NOTIFICATIONS_CHANNEL = "email"

        await notifications.enqueueEmail({
          kind: "test_failure",
          recipient: "notify-fail@howsu.local",
          to: "notify-fail@howsu.local",
          subject: "Should fail",
        })

        try {
          // First drain: attempt 1 → backoff, still pending.
          let result = await notifications.drainEmail()
          expect(result.failed).toEqual(1)
          let [row] = await notifications.listNotificationOutboxes({
            recipient: "notify-fail@howsu.local",
          })
          expect(row.status).toEqual("pending")
          expect(row.attempts).toEqual(1)
          expect(row.last_error).toContain("EMAIL_API_KEY")

          // Not due yet (backoff set) → skipped.
          result = await notifications.drainEmail()
          expect(result.attempted).toEqual(0)

          // Force-due and drain again: attempt 2 hits the cap → failed.
          await notifications.updateNotificationOutboxes({
            id: row.id,
            next_attempt_at: new Date(Date.now() - 1000),
          })
          result = await notifications.drainEmail()
          expect(result.failed).toEqual(1)

          ;[row] = await notifications.listNotificationOutboxes({
            recipient: "notify-fail@howsu.local",
          })
          expect(row.status).toEqual("failed")
          expect(row.attempts).toEqual(2)
        } finally {
          process.env.NOTIFICATIONS_CHANNEL = prevChannel
        }
      })

      it("tracks brevo channel failures when SMTP creds are missing", async () => {
        // Point the transport at brevo with no SMTP creds so it throws.
        const prevChannel = process.env.NOTIFICATIONS_CHANNEL
        delete process.env.BREVO_SMTP_HOST
        delete process.env.BREVO_SMTP_USER
        delete process.env.BREVO_SMTP_PASS
        process.env.NOTIFICATIONS_CHANNEL = "brevo"

        await notifications.enqueueEmail({
          kind: "test_brevo_failure",
          recipient: "notify-brevo@howsu.local",
          to: "notify-brevo@howsu.local",
          subject: "Should fail",
        })

        try {
          const result = await notifications.drainEmail()
          expect(result.failed).toEqual(1)

          const [row] = await notifications.listNotificationOutboxes({
            recipient: "notify-brevo@howsu.local",
          })
          expect(row.status).toEqual("pending")
          expect(row.attempts).toEqual(1)
          expect(row.last_error).toContain("BREVO_SMTP")
        } finally {
          process.env.NOTIFICATIONS_CHANNEL = prevChannel
        }
      })

      it("leaves rows pending (skipped) when the email transport is disabled", async () => {
        const prevEnabled = process.env.NOTIFICATIONS_EMAIL_ENABLED
        delete process.env.NOTIFICATIONS_EMAIL_ENABLED

        try {
          await notifications.enqueueEmail({
            kind: "test_disabled",
            recipient: "notify-off@howsu.local",
            to: "notify-off@howsu.local",
            subject: "Never sent while disabled",
          })

          const result = await notifications.drainEmail()
          expect(result.skipped).toEqual(1)
          expect(result.attempted).toEqual(0)

          const [row] = await notifications.listNotificationOutboxes({
            recipient: "notify-off@howsu.local",
          })
          expect(row.status).toEqual("pending")
        } finally {
          process.env.NOTIFICATIONS_EMAIL_ENABLED = prevEnabled
        }
      })
    })
  },
})

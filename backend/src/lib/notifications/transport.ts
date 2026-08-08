import { MedusaError } from "@medusajs/framework/utils"
import nodemailer from "nodemailer"

// Shared out-of-band notification transport. OFF BY DEFAULT: nothing sends
// until NOTIFICATIONS_EMAIL_ENABLED=true. Channels:
//   - mock   — log the message, never hit the network (dev/test only; refused
//              in production so a misconfigured deploy can't silently "send").
//   - email  — Resend HTTP API (EMAIL_API_KEY / EMAIL_FROM).
//   - brevo  — Brevo SMTP relay via nodemailer (BREVO_SMTP_HOST / BREVO_SMTP_PORT /
//              BREVO_SMTP_USER / BREVO_SMTP_PASS / EMAIL_FROM). SMTP creds come
//              from Brevo SMTP > SMTP keys; the "user" is the SMTP login and the
//              "pass" is the master SMTP key (NOT the account password).
// Callers treat failures as non-fatal; the outbox drain job records outcomes.

export type EmailMessage = {
  to: string
  subject: string
  html: string
}

export type SendResult = {
  channel: "mock" | "email" | "brevo"
  messageId?: string | null
}

export async function sendEmail(message: EmailMessage): Promise<SendResult> {
  if (process.env.NOTIFICATIONS_EMAIL_ENABLED !== "true") {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "Notifications email is not enabled (NOTIFICATIONS_EMAIL_ENABLED)"
    )
  }

  const channel = process.env.NOTIFICATIONS_CHANNEL || "email"

  switch (channel) {
    case "mock":
      if (process.env.NODE_ENV === "production") {
        throw new MedusaError(
          MedusaError.Types.INVALID_DATA,
          "Mock notification channel is not allowed in production"
        )
      }
      // eslint-disable-next-line no-console
      console.log(`[notifications:mock] to=${message.to} subject="${message.subject}"`)
      return { channel: "mock" }

    case "email": {
      const apiKey = process.env.EMAIL_API_KEY
      if (!apiKey) {
        throw new MedusaError(
          MedusaError.Types.INVALID_DATA,
          "EMAIL_API_KEY is not configured"
        )
      }
      const from = process.env.EMAIL_FROM || "team@howsu.local"

      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from,
          to: [message.to],
          subject: message.subject,
          html: message.html,
        }),
      })

      if (!response.ok) {
        throw new MedusaError(
          MedusaError.Types.INVALID_DATA,
          `Failed to send notification email (${response.status})`
        )
      }

      const data = (await response.json().catch(() => null)) as {
        id?: string
      } | null

      return { channel: "email", messageId: data?.id ?? null }
    }

    case "brevo": {
      const host = process.env.BREVO_SMTP_HOST
      const port = Number(process.env.BREVO_SMTP_PORT ?? 587)
      const user = process.env.BREVO_SMTP_USER
      const pass = process.env.BREVO_SMTP_PASS

      if (!host || !user || !pass) {
        throw new MedusaError(
          MedusaError.Types.INVALID_DATA,
          "BREVO_SMTP_HOST / BREVO_SMTP_USER / BREVO_SMTP_PASS are not configured"
        )
      }
      const from = process.env.EMAIL_FROM || "team@howsu.local"

      const transporter = nodemailer.createTransport({
        host,
        port,
        secure: port === 465,
        auth: { user, pass },
      })

      try {
        const info = await transporter.sendMail({
          from,
          to: message.to,
          subject: message.subject,
          html: message.html,
        })
        return { channel: "brevo", messageId: info.messageId ?? null }
      } finally {
        transporter.close()
      }
    }

    default:
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        `Unknown NOTIFICATIONS_CHANNEL "${channel}"`
      )
  }
}

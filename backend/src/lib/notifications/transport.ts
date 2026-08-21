import { MedusaError } from "@medusajs/framework/utils"
import nodemailer from "nodemailer"

// Shared out-of-band notification transport. OFF BY DEFAULT: nothing sends
// until NOTIFICATIONS_EMAIL_ENABLED=true. Channels:
//   - mock   — log the message, never hit the network (dev/test only; refused
//              in production so a misconfigured deploy can't silently "send").
//   - email  — Resend HTTP API (EMAIL_API_KEY / EMAIL_FROM).
//   - brevo  — Brevo HTTP API when BREVO_API_KEY is present (recommended for
//              cloud runtimes), with SMTP relay as a supported fallback.
// Callers treat failures as non-fatal; the outbox drain job records outcomes.

export type EmailMessage = {
  to: string
  subject: string
  html: string
}

type EmailSender = {
  name: string
  address: string
}

function resolveSender(): EmailSender {
  // BREVO_SENDER_EMAIL must be a sender or authenticated domain in Brevo.
  // EMAIL_FROM remains the backwards-compatible fallback for existing deploys.
  const configured =
    process.env.BREVO_SENDER_EMAIL || process.env.EMAIL_FROM || ""
  const match = configured.match(/<([^>]+)>/) || configured.match(/([\w.+-]+@[\w.-]+\.[A-Za-z]{2,})/)
  const address = (match?.[1] || configured).trim().toLowerCase()

  if (!address || !address.includes("@") || address.endsWith(".local")) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "A verified email sender is not configured"
    )
  }

  return {
    name: process.env.BREVO_FROM_NAME || "How's U",
    address,
  }
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
      const sender = resolveSender()

      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: `${sender.name} <${sender.address}>`,
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
      const sender = resolveSender()
      const apiKey = process.env.BREVO_API_KEY

      // Prefer Brevo's HTTPS API. Some managed runtimes block outbound SMTP
      // ports even when the application itself has normal HTTPS egress.
      if (apiKey) {
        const controller = new AbortController()
        const timeout = setTimeout(
          () => controller.abort(),
          Number(process.env.BREVO_API_TIMEOUT_MS ?? 10000)
        )

        try {
          const response = await fetch("https://api.brevo.com/v3/smtp/email", {
            method: "POST",
            headers: {
              "api-key": apiKey,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              sender: { name: sender.name, email: sender.address },
              to: [{ email: message.to }],
              subject: message.subject,
              htmlContent: message.html,
            }),
            signal: controller.signal,
          })

          if (!response.ok) {
            throw new MedusaError(
              MedusaError.Types.INVALID_DATA,
              `Brevo email delivery failed (${response.status})`
            )
          }

          const data = (await response.json().catch(() => null)) as {
            messageId?: string
          } | null

          return { channel: "brevo", messageId: data?.messageId ?? null }
        } finally {
          clearTimeout(timeout)
        }
      }

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
      const transporter = nodemailer.createTransport({
        host,
        port,
        secure: port === 465,
        auth: { user, pass },
        // Never hold signup, password reset, or checkout notifications open
        // for a platform-level SMTP outage. These can be overridden for a
        // slower relay, but the production defaults fail fast and retry via
        // the caller's normal flow instead of freezing the UI.
        connectionTimeout: Number(
          process.env.BREVO_SMTP_CONNECTION_TIMEOUT_MS ?? 10000
        ),
        greetingTimeout: Number(
          process.env.BREVO_SMTP_GREETING_TIMEOUT_MS ?? 10000
        ),
        socketTimeout: Number(
          process.env.BREVO_SMTP_SOCKET_TIMEOUT_MS ?? 15000
        ),
      })

      try {
        const info = await transporter.sendMail({
          from: sender,
          ...(process.env.BREVO_REPLY_TO
            ? { replyTo: process.env.BREVO_REPLY_TO }
            : {}),
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

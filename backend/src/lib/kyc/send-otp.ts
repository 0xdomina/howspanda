import { MedusaError } from "@medusajs/framework/utils"
import { sendEmail as sendNotificationEmail } from "../notifications/transport"

// Verification delivery seam for auth + KYC OTPs. OFF BY DEFAULT:
// nothing leaves the box until KYC_VERIFICATION_ENABLED=true.
//
// Post-launch, set:
//   KYC_VERIFICATION_ENABLED=true
//   KYC_VERIFICATION_CHANNEL=email | whatsapp
// and configure the selected provider. The `mock` channel is dev-only and
// is refused in production so a misconfigured deploy fails loud instead of
// reporting "sent" with nothing delivered.
//
// All failures throw a short user-facing message ("We could not send the
// code. Please try again."). Provider detail stays in server logs only.

export type OtpSendResult = string | null

const SEND_FAILURE_MESSAGE =
  "We could not send the code. Please try again."

function logDeliveryFailure(detail: unknown) {
  // eslint-disable-next-line no-console
  console.error(
    "[otp] delivery failed",
    detail instanceof Error ? detail.message : "unknown error"
  )
}

export async function sendOtp(input: {
  channel: "email" | "whatsapp"
  destination: string
  code: string
}): Promise<OtpSendResult> {
  if (process.env.KYC_VERIFICATION_ENABLED !== "true") {
    // Fail loud in production so a missing toggle surfaces as an error
    // instead of a stored code with no delivery. Dev keeps the offline
    // no-op so local flows complete without a provider.
    // eslint-disable-next-line no-console
    console.error("[otp] verification disabled, code stored but not delivered")
    if (process.env.NODE_ENV === "production") {
      throw new MedusaError(MedusaError.Types.INVALID_DATA, SEND_FAILURE_MESSAGE)
    }
    // dev: no-op
    return null
  }

  const channel = process.env.KYC_VERIFICATION_CHANNEL || "email"

  switch (channel) {
    case "mock":
      // Dev/staging only: hand the code straight back. Refusing in production
      // prevents a misconfigured deployment from echoing OTPs to callers.
      if (process.env.NODE_ENV === "production") {
        // eslint-disable-next-line no-console
        console.error("[otp] mock channel refused in production")
        throw new MedusaError(
          MedusaError.Types.INVALID_DATA,
          SEND_FAILURE_MESSAGE
        )
      }
      return input.code
    case "email":
      try {
        return await sendEmail(input.destination, input.code)
      } catch (error) {
        logDeliveryFailure(error)
        throw new MedusaError(
          MedusaError.Types.INVALID_DATA,
          SEND_FAILURE_MESSAGE
        )
      }
    case "whatsapp":
      try {
        return await sendWhatsApp(input.destination, input.code)
      } catch (error) {
        logDeliveryFailure(error)
        throw new MedusaError(
          MedusaError.Types.INVALID_DATA,
          SEND_FAILURE_MESSAGE
        )
      }
    default:
      // eslint-disable-next-line no-console
      console.error(`[otp] unknown verification channel "${channel}"`)
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        SEND_FAILURE_MESSAGE
      )
  }
}

// Email verification uses the same configured transactional transport as the
// rest of the platform. This keeps OTP delivery on Brevo when the production
// notification channel is set to `brevo`, without requiring a second provider
// account or a second secret.
async function sendEmail(destination: string, code: string): Promise<OtpSendResult> {
  const result = await sendNotificationEmail({
    to: destination,
    subject: "Your How's U verification code",
    html: `<p>Your verification code is <strong>${code}</strong>. It expires in 15 minutes.</p>`,
  })
  // eslint-disable-next-line no-console
  console.log(
    `[otp] email delivery ok channel=${result.channel} messageId=${result.messageId ?? "n/a"}`
  )
  return null
}

// WhatsApp Business Cloud API send (authentication template). Only fires when
// verification is enabled AND credentials are configured.
async function sendWhatsApp(destination: string, code: string): Promise<OtpSendResult> {
  const token = process.env.KYC_WHATSAPP_ACCESS_TOKEN
  const phoneNumberId = process.env.KYC_WHATSAPP_PHONE_NUMBER_ID
  if (!token || !phoneNumberId) {
    // eslint-disable-next-line no-console
    console.error("[otp] whatsapp credentials missing")
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      SEND_FAILURE_MESSAGE
    )
  }

  const response = await fetch(
    `https://graph.facebook.com/v21.0/${phoneNumberId}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: destination,
        type: "template",
        template: {
          name: "authentication_code",
          language: { code: "en" },
          components: [
            {
              type: "body",
              parameters: [{ type: "text", text: code }],
            },
          ],
        },
      }),
    }
  )

  if (!response.ok) {
    // eslint-disable-next-line no-console
    console.error(`[otp] whatsapp delivery failed status=${response.status}`)
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      SEND_FAILURE_MESSAGE
    )
  }
  return null
}

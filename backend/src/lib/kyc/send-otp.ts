import { MedusaError } from "@medusajs/framework/utils"
import { sendEmail as sendNotificationEmail } from "../notifications/transport"

// Verification delivery seam for KYC OTPs. WIRED BUT OFF BY DEFAULT:
// nothing actually emails/SMSes/WhatsApps until KYC_VERIFICATION_ENABLED=true.
// Until then every call is a no-op that returns null (no code is exposed).
//
// Post-launch, set:
//   KYC_VERIFICATION_ENABLED=true
//   KYC_VERIFICATION_CHANNEL=email | whatsapp
// and configure the selected provider. The `mock` channel is dev-only.

export type OtpSendResult = string | null

export async function sendOtp(input: {
  channel: "email"
  destination: string
  code: string
}): Promise<OtpSendResult> {
  if (process.env.KYC_VERIFICATION_ENABLED !== "true") {
    // No-op: verification is intentionally disabled (pre-launch default).
    return null
  }

  const channel = process.env.KYC_VERIFICATION_CHANNEL || "mock"

  switch (channel) {
    case "mock":
      // Dev/staging only: hand the code straight back. Refusing in production
      // prevents a misconfigured deployment from echoing OTPs to callers.
      if (process.env.NODE_ENV === "production") {
        throw new MedusaError(
          MedusaError.Types.INVALID_DATA,
          "Mock OTP channel is not allowed in production"
        )
      }
      return input.code
    case "email":
      return sendEmail(input.destination, input.code)
    default:
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        `Unknown KYC_VERIFICATION_CHANNEL "${channel}"`
      )
  }
}

// Email verification uses the same configured transactional transport as the
// rest of the platform. This keeps OTP delivery on Brevo when the production
// notification channel is set to `brevo`, without requiring a second provider
// account or a second secret.
async function sendEmail(destination: string, code: string): Promise<OtpSendResult> {
  await sendNotificationEmail({
    to: destination,
    subject: "Your How's U verification code",
    html: `<p>Your verification code is <strong>${code}</strong>. It expires in 15 minutes.</p>`,
  })
  return null
}

// WhatsApp Business Cloud API send (authentication template). Only fires when
// verification is enabled AND credentials are configured.
async function sendWhatsApp(destination: string, code: string): Promise<OtpSendResult> {
  const token = process.env.KYC_WHATSAPP_ACCESS_TOKEN
  const phoneNumberId = process.env.KYC_WHATSAPP_PHONE_NUMBER_ID
  if (!token || !phoneNumberId) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "KYC_WHATSAPP_ACCESS_TOKEN / KYC_WHATSAPP_PHONE_NUMBER_ID not configured"
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
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      `Failed to send WhatsApp verification (${response.status})`
    )
  }
  return null
}

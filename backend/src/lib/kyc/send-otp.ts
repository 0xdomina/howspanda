import { MedusaError } from "@medusajs/framework/utils"

// Verification delivery seam for KYC OTPs. WIRED BUT OFF BY DEFAULT:
// nothing actually emails/SMSes/WhatsApps until KYC_VERIFICATION_ENABLED=true.
// Until then every call is a no-op that returns null (no code is exposed).
//
// Post-launch, set:
//   KYC_VERIFICATION_ENABLED=true
//   KYC_VERIFICATION_CHANNEL=mock | email | whatsapp
// and drop the provider's keys in. The `mock` channel returns the raw code so
// dev/staging can still exercise the full ladder without external cost.

export type OtpSendResult = string | null

export async function sendOtp(input: {
  channel: "email" | "phone"
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
    case "whatsapp":
      return sendWhatsApp(input.destination, input.code)
    default:
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        `Unknown KYC_VERIFICATION_CHANNEL "${channel}"`
      )
  }
}

// A Resend-style email send. Replace with any provider; only fires when
// verification is enabled AND an API key is present.
async function sendEmail(destination: string, code: string): Promise<OtpSendResult> {
  const apiKey = process.env.KYC_EMAIL_API_KEY
  const from = process.env.KYC_EMAIL_FROM || "verify@howsu.local"
  if (!apiKey) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "KYC_EMAIL_API_KEY is not configured"
    )
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [destination],
      subject: "Your How's u verification code",
      html: `<p>Your verification code is <strong>${code}</strong>. It expires in 15 minutes.</p>`,
    }),
  })

  if (!response.ok) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      `Failed to send verification email (${response.status})`
    )
  }
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

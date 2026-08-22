import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import AuthOtpModuleService from "../../../../modules/auth-otp/service"
import { AUTH_OTP_MODULE } from "../../../../modules/auth-otp"
import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils"
import { z } from "@medusajs/framework/zod"
import { PostAuthOtpRequestSchema } from "../../../middlewares"

type Body = z.infer<typeof PostAuthOtpRequestSchema>

// Request a one-time code for a credential flow (signup verification or
// forgot-password reset). The raw code is returned only outside production so
// dev/staging flows can complete; in production it is delivered via the send
// seam (email/WhatsApp) and never echoed in the response. Verification always
// enforces the stored hash — there is no accept-any-code bypass.
export const POST = async (
  req: MedusaRequest<Body>,
  res: MedusaResponse
) => {
  const body = req.validatedBody

  // A signup OTP must never be sent for an identity that already has an
  // email/password account. Apart from wasting a delivery, continuing here
  // used to let the code verify successfully and then fail later with a vague
  // "Forbidden" response from the auth provider. Reset flows intentionally
  // skip this check because they are for existing accounts.
  if (body.purpose === "signup") {
    const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
    const existing = await query.graph({
      entity: "auth_identity",
      fields: ["id", "provider_identities.provider", "provider_identities.entity_id"],
      filters: {
        provider_identities: {
          provider: "emailpass",
          entity_id: body.email.trim().toLowerCase(),
        },
      },
    })

    if (existing.data?.length) {
      throw new MedusaError(
        MedusaError.Types.CONFLICT,
        "An account with this email already exists. Sign in instead."
      )
    }
  }

  const authOtp = req.scope.resolve<AuthOtpModuleService>(AUTH_OTP_MODULE)

  const { code } = await authOtp.requestOtp({
    email: body.email,
    purpose: body.purpose,
  })

  res.status(201).json({ ok: true, code })
}

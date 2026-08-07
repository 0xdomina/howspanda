import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import AuthOtpModuleService from "../../../../modules/auth-otp/service"
import { AUTH_OTP_MODULE } from "../../../../modules/auth-otp"
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
  const authOtp = req.scope.resolve<AuthOtpModuleService>(AUTH_OTP_MODULE)

  const { code } = await authOtp.requestOtp({
    email: body.email,
    purpose: body.purpose,
  })

  res.status(201).json({ ok: true, code })
}

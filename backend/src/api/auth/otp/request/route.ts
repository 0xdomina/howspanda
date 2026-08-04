import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import AuthOtpModuleService from "../../../../modules/auth-otp/service"
import { AUTH_OTP_MODULE } from "../../../../modules/auth-otp"
import { z } from "@medusajs/framework/zod"
import { PostAuthOtpRequestSchema } from "../../../middlewares"

type Body = z.infer<typeof PostAuthOtpRequestSchema>

// Request a one-time code for a credential flow (signup verification or
// forgot-password reset). In dev/staging (mock channel + verification enabled)
// the raw code is returned so local flows can complete; otherwise the send
// seam is a no-op and verification accepts any non-empty code.
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

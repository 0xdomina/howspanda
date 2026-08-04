import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { Modules } from "@medusajs/framework/utils"
import AuthOtpModuleService from "../../../../modules/auth-otp/service"
import { AUTH_OTP_MODULE } from "../../../../modules/auth-otp"
import { normalizeEmail } from "../../../../modules/auth-otp/service"
import { z } from "@medusajs/framework/zod"
import { PostAuthOtpResetSchema } from "../../../middlewares"

type Body = z.infer<typeof PostAuthOtpResetSchema>

// Forgot-password reset: verify the presented code, then set the new password
// on the emailpass auth identity directly (OTP verification is the proof, so
// no reset JWT is needed). An unknown email returns ok without leaking that
// no account exists (mirrors the built-in always-201 reset behavior).
export const POST = async (
  req: MedusaRequest<Body>,
  res: MedusaResponse
) => {
  const body = req.validatedBody
  const authOtp = req.scope.resolve<AuthOtpModuleService>(AUTH_OTP_MODULE)

  await authOtp.verifyOtp({
    email: body.email,
    purpose: "reset",
    code: body.code,
  })

  const authService = req.scope.resolve(Modules.AUTH)
  await authService.updateProvider("emailpass", {
    entity_id: normalizeEmail(body.email),
    password: body.newPassword,
  })

  res.json({ ok: true })
}

import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import {
  ContainerRegistrationKeys,
  generateJwtToken,
} from "@medusajs/framework/utils"
import AuthOtpModuleService from "../../../../modules/auth-otp/service"
import { AUTH_OTP_MODULE } from "../../../../modules/auth-otp"
import { normalizeEmail } from "../../../../modules/auth-otp/service"
import { z } from "@medusajs/framework/zod"
import { PostAuthOtpVerifySchema } from "../../../middlewares"

type Body = z.infer<typeof PostAuthOtpVerifySchema>

// Verify a presented code for a credential flow. On success a short-lived
// signed proof is issued so the signup step can prove (server-side) that this
// email passed verification — the register flow is gated on it.
export const POST = async (
  req: MedusaRequest<Body>,
  res: MedusaResponse
) => {
  const body = req.validatedBody
  const authOtp = req.scope.resolve<AuthOtpModuleService>(AUTH_OTP_MODULE)

  await authOtp.verifyOtp({
    email: body.email,
    purpose: body.purpose,
    code: body.code,
  })

  const { http } =
    req.scope.resolve(ContainerRegistrationKeys.CONFIG_MODULE).projectConfig
  const proof = generateJwtToken(
    {
      email: normalizeEmail(body.email),
      purpose: "email_verified",
    },
    {
      secret: http.jwtSecret,
      expiresIn: "10m",
    }
  )

  res.json({ ok: true, proof })
}

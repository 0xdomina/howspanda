import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils"
import { normalizeEmail } from "../../../../modules/auth-otp/service"
import jwt from "jsonwebtoken"
import { z } from "@medusajs/framework/zod"
import { PostAuthOtpAssertSchema } from "../../../middlewares"

type Body = z.infer<typeof PostAuthOtpAssertSchema>

// Gate for the signup flow: the presented proof must be a valid, unexpired
// token that (a) marks this email as verified and (b) matches the email about
// to be registered. Rejects everything else.
export const POST = async (
  req: MedusaRequest<Body>,
  res: MedusaResponse
) => {
  const body = req.validatedBody
  const { http } =
    req.scope.resolve(ContainerRegistrationKeys.CONFIG_MODULE).projectConfig

  const secret = http.jwtSecret
  if (!secret) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "JWT secret is not configured"
    )
  }

  const reject = () =>
    new MedusaError(
      MedusaError.Types.UNAUTHORIZED,
      "Email verification is required to create an account"
    )

  let payload: { purpose?: string; email?: string } | string
  try {
    payload = jwt.verify(body.proof, secret) as { purpose?: string; email?: string }
  } catch {
    throw reject()
  }

  const proof = typeof payload === "object" ? payload : null
  if (
    !proof ||
    proof.purpose !== "email_verified" ||
    (proof.email as string | undefined)?.toLowerCase() !== normalizeEmail(body.email)
  ) {
    throw reject()
  }

  res.json({ ok: true })
}

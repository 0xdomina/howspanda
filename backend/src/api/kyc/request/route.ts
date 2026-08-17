import { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import KycModuleService from "../../../modules/kyc/service"
import { KYC_MODULE } from "../../../modules/kyc"
import { z } from "@medusajs/framework/zod"
import { PostKycRequestSchema } from "../../middlewares"
import { resolveActorEmail } from "../../../lib/accounts/resolve-actor-email"

type Body = z.infer<typeof PostKycRequestSchema>

// Request a one-time code for email or phone. In dev/staging (mock channel
// + KYC_VERIFICATION_ENABLED=true) the raw code is returned so tests and
// local flows can complete the ladder. In production the seam is a no-op.
// The profile is keyed by the signup identifier (email OR phone); the code
// is sent to `destination` (the complementary identifier being verified).
export const POST = async (
  req: AuthenticatedMedusaRequest<Body>,
  res: MedusaResponse
) => {
  const body = req.validatedBody
  const email = await resolveActorEmail(req)
  const kyc = req.scope.resolve<KycModuleService>(KYC_MODULE)

  const { code } = await kyc.requestOtp({
    email,
    channel: body.channel,
    destination: email,
  })

  res.status(201).json({ ok: true, code })
}

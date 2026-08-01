import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import KycModuleService from "../../../modules/kyc/service"
import { KYC_MODULE } from "../../../modules/kyc"
import { z } from "@medusajs/framework/zod"
import { PostKycRequestSchema } from "../../middlewares"

type Body = z.infer<typeof PostKycRequestSchema>

// Request a one-time code for email or phone. In dev/staging (mock channel
// + KYC_VERIFICATION_ENABLED=true) the raw code is returned so tests and
// local flows can complete the ladder. In production the seam is a no-op.
export const POST = async (
  req: MedusaRequest<Body>,
  res: MedusaResponse
) => {
  const body = req.validatedBody
  const kyc = req.scope.resolve<KycModuleService>(KYC_MODULE)

  const { code } = await kyc.requestOtp({
    email: body.email,
    channel: body.channel,
    destination: body.destination,
  })

  res.status(201).json({ ok: true, code })
}

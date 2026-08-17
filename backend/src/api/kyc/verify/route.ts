import { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import KycModuleService from "../../../modules/kyc/service"
import { KYC_MODULE } from "../../../modules/kyc"
import { z } from "@medusajs/framework/zod"
import { PostKycVerifySchema } from "../../middlewares"
import { resolveActorEmail } from "../../../lib/accounts/resolve-actor-email"

type Body = z.infer<typeof PostKycVerifySchema>

export const POST = async (
  req: AuthenticatedMedusaRequest<Body>,
  res: MedusaResponse
) => {
  const body = req.validatedBody
  const email = await resolveActorEmail(req)
  const kyc = req.scope.resolve<KycModuleService>(KYC_MODULE)

  const result = await kyc.verifyOtp({
    email,
    channel: body.channel,
    destination: email,
    code: body.code,
  })

  res.json({ ok: result.ok, profile: result.profile })
}

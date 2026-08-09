import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import KycModuleService from "../../../modules/kyc/service"
import { KYC_MODULE } from "../../../modules/kyc"
import { z } from "@medusajs/framework/zod"
import { PostKycVerifySchema } from "../../middlewares"

type Body = z.infer<typeof PostKycVerifySchema>

export const POST = async (
  req: MedusaRequest<Body>,
  res: MedusaResponse
) => {
  const body = req.validatedBody
  const kyc = req.scope.resolve<KycModuleService>(KYC_MODULE)

  const result = await kyc.verifyOtp({
    email: body.email,
    channel: body.channel,
    destination: body.destination,
    code: body.code,
  })

  res.json({ ok: result.ok, profile: result.profile })
}

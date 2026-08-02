import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import KycModuleService from "../../../modules/kyc/service"
import { KYC_MODULE } from "../../../modules/kyc"
import { z } from "@medusajs/framework/zod"
import { PostKycIdentitySchema } from "../../middlewares"

type Body = z.infer<typeof PostKycIdentitySchema>

// Submit an identity document (NIN). Enters the ladder as "pending" — an
// admin review or future NIN provider flips it to verified.
export const POST = async (
  req: MedusaRequest<Body>,
  res: MedusaResponse
) => {
  const body = req.validatedBody
  const kyc = req.scope.resolve<KycModuleService>(KYC_MODULE)

  const result = await kyc.submitIdentity({
    email: body.email,
    phone: body.phone,
    id_type: body.id_type,
    id_number: body.id_number,
  })

  res.status(201).json({ ok: result.ok, profile: result.profile })
}

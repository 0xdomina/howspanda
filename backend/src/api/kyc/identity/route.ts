import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import KycModuleService from "../../../modules/kyc/service"
import { KYC_MODULE } from "../../../modules/kyc"
import { z } from "@medusajs/framework/zod"
import { PostKycIdentitySchema } from "../../middlewares"
import { syncSellerVerificationStatus } from "../../../lib/sellers/verification-status"

type Body = z.infer<typeof PostKycIdentitySchema>

// Submit an identity document (NIN). Off (default) it enters the ladder as
// "pending"; when FEATURE_NIN_VERIFICATION is on, the extracted JSON is matched
// against the profile and the submission is auto-verified — no admin review.
// The identity state is mirrored onto the owning sellers' verification status.
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
    extracted: body.extracted,
  })

  await syncSellerVerificationStatus(
    req.scope,
    { email: body.email, phone: body.phone },
    result.profile.id_status === "verified" ? "verified" : "pending"
  )

  res.status(201).json({ ok: result.ok, profile: result.profile })
}

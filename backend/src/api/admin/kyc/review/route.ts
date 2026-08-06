import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import KycModuleService from "../../../../modules/kyc/service"
import { KYC_MODULE } from "../../../../modules/kyc"
import { z } from "@medusajs/framework/zod"
import { PostKycReviewSchema } from "../../../middlewares"
import { syncSellerVerificationStatus } from "../../../../lib/sellers/verification-status"

type Body = z.infer<typeof PostKycReviewSchema>

// Admin review of a submitted identity. Approving flips the KYC ladder to
// verified (and the owning sellers to verified); rejecting sends them back to
// unverified. This is where a future NIN provider match would also land.
export const POST = async (
  req: MedusaRequest<Body>,
  res: MedusaResponse
) => {
  const body = req.validatedBody
  const kyc = req.scope.resolve<KycModuleService>(KYC_MODULE)

  const result = await kyc.reviewIdentity({
    email: body.email,
    phone: body.phone,
    decision: body.decision,
  })

  await syncSellerVerificationStatus(
    req.scope,
    { email: body.email, phone: body.phone },
    body.decision === "verified" ? "verified" : "unverified"
  )

  res.json({ ok: result.ok, profile: result.profile })
}

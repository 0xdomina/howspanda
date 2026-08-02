import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import KycModuleService from "../../../modules/kyc/service"
import { KYC_MODULE } from "../../../modules/kyc"

// Public, quota-free profile view by email or phone — same identity model as
// delivery. Never returns the full ID number.
export const GET = async (
  req: MedusaRequest,
  res: MedusaResponse
) => {
  const email = (req.query?.email as string | undefined) ?? ""
  const phone = (req.query?.phone as string | undefined) ?? ""
  if (!email && !phone) {
    res
      .status(400)
      .json({ ok: false, message: "email or phone query param is required" })
    return
  }
  const kyc = req.scope.resolve<KycModuleService>(KYC_MODULE)
  const profile = await kyc.getProfileView({ email, phone })
  res.json({ ok: true, profile })
}

import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import KycModuleService from "../../../modules/kyc/service"
import { KYC_MODULE } from "../../../modules/kyc"

// Public, quota-free profile view by email — same identity model as delivery
// (email is the identity). Never returns the full ID number.
export const GET = async (
  req: MedusaRequest,
  res: MedusaResponse
) => {
  const email = (req.query?.email as string | undefined) ?? ""
  if (!email) {
    res.status(400).json({ ok: false, message: "email query param is required" })
    return
  }
  const kyc = req.scope.resolve<KycModuleService>(KYC_MODULE)
  const profile = await kyc.getProfileView(email)
  res.json({ ok: true, profile })
}

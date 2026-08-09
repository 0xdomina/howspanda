import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import KycModuleService from "../../../modules/kyc/service"
import { KYC_MODULE } from "../../../modules/kyc"

// KYC state is account data. It is read from the authenticated actor rather
// than accepting an arbitrary email/phone lookup from the public internet.
export const GET = async (
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) => {
  const kyc = req.scope.resolve<KycModuleService>(KYC_MODULE)
  const profile = await kyc.getProfileForUser(req.auth_context)
  res.json({ ok: true, profile })
}

import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import KycModuleService from "../../../../modules/kyc/service"
import { KYC_MODULE } from "../../../../modules/kyc"
import { resolveActorEmail } from "../../../../lib/accounts/resolve-actor-email"

// The authenticated user's platform-wide KYC state, read off their profile
// (customer or seller account). "All info about the user lives on the user" —
// this is the KYC surface for the account pages, mirroring the seller view on
// /sellers/me for every actor type.
export const GET = async (
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) => {
  const kyc = req.scope.resolve<KycModuleService>(KYC_MODULE)
  const email = await resolveActorEmail(req)

  const profile = await kyc.getProfileForUser(req.auth_context, email)

  res.json({ kyc: profile })
}

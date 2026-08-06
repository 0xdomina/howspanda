import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import KycModuleService from "../../../../modules/kyc/service"
import { KYC_MODULE } from "../../../../modules/kyc"
import { resolveActorEmail } from "../../../../lib/accounts/resolve-actor-email"

// Save the personal profile portion of the KYC ladder for the signed-in user.
// Names must match the ID card; address/country/state/city are what complete
// the profile_completed level that unlocks seller + courier features. The KYC
// row is anchored to the user's account, so no identifier is taken from the
// body — the actor is the profile owner.
export const POST = async (
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) => {
  const kyc = req.scope.resolve<KycModuleService>(KYC_MODULE)
  const email = await resolveActorEmail(req)
  const body = req.validatedBody as {
    first_name?: string
    last_name?: string
    other_name?: string
    address?: string
    country?: string
    state?: string
    city?: string
    postal_code?: string
  }

  const profile = await kyc.saveProfile({
    email,
    userType: req.auth_context?.actor_type === "seller" ? "seller" : "customer",
    userId: req.auth_context?.actor_id ?? null,
    ...body,
  })

  res.json({ profile })
}

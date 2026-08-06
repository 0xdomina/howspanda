import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { z } from "@medusajs/framework/zod"
import DeliveryModuleService from "../../../../modules/delivery/service"
import { DELIVERY_MODULE } from "../../../../modules/delivery"
import KycModuleService from "../../../../modules/kyc/service"
import { KYC_MODULE } from "../../../../modules/kyc"
import { resolveActorEmail } from "../../../../lib/accounts/resolve-actor-email"
import { resolveActorProfile } from "../../../../lib/accounts/resolve-actor-profile"

// Enter or update courier details (metadata only). Courierhood itself is
// activated by the KYC ladder — a signed-in customer or seller account that
// reaches phone-verified can already offer; this endpoint just records the
// name/city/vehicle the delivery board shows. The courier's identity always
// comes from the authenticated actor, never from the request body.
export const PostCourierApplySchema = z.strictObject({
  name: z.string().min(1).max(100).optional(),
  phone: z.string().min(7).max(32).optional(),
  city: z.string().min(1).max(100).optional(),
  vehicle: z.string().min(1).max(100).optional(),
})

export const POST = async (
  req: AuthenticatedMedusaRequest<z.infer<typeof PostCourierApplySchema>>,
  res: MedusaResponse
) => {
  const body = req.validatedBody
  const email = await resolveActorEmail(req)

  // Minimum KYC level to courier: phone verified. The account holder owns the
  // email (login credential), so the phone is the complementary identifier.
  const kyc = req.scope.resolve<KycModuleService>(KYC_MODULE)
  await kyc.assertCourierKyc(email)

  // The courier's display name is their real profile name — prefilled from the
  // account when the applicant didn't type one, so the platform shows the
  // proper name instead of ever deriving anything from the email. The phone
  // defaults to the verified KYC phone (the reachable contact we vetted).
  const actorProfile = await resolveActorProfile(req)
  const kycView = await kyc.getProfileView({ email })

  const delivery = req.scope.resolve<DeliveryModuleService>(DELIVERY_MODULE)
  const profile = await delivery.applyCourier({
    courierEmail: email,
    authIdentityId: req.auth_context.auth_identity_id ?? null,
    actorType: (req.auth_context.actor_type as "customer" | "seller") ?? null,
    name: body.name ?? actorProfile.name,
    phone: body.phone ?? kycView?.phone ?? actorProfile.phone,
    city: body.city,
    vehicle: body.vehicle,
  })

  res.json({ courier: profile })
}

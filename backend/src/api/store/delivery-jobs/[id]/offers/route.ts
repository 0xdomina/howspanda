import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { z } from "@medusajs/framework/zod"
import DeliveryModuleService from "../../../../../modules/delivery/service"
import { DELIVERY_MODULE } from "../../../../../modules/delivery"
import type { MakeOfferInput } from "../../../../../modules/delivery/service"
import KycModuleService from "../../../../../modules/kyc/service"
import { KYC_MODULE } from "../../../../../modules/kyc"
import { resolveActorEmail } from "../../../../../lib/accounts/resolve-actor-email"

// Making an offer is a courier action: only a signed-in account holder with an
// APPROVED courier application and at least phone-verified KYC can bid. The
// courier's email is derived from the authenticated actor — a client-supplied
// email is never trusted (an anonymous visitor cannot pose as a courier).
export const POST = async (
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) => {
  const { id } = req.params as { id: string }
  const body = req.validatedBody as MakeOfferInput
  const email = await resolveActorEmail(req)

  const deliveryService = req.scope.resolve<DeliveryModuleService>(DELIVERY_MODULE)
  const kyc = req.scope.resolve<KycModuleService>(KYC_MODULE)

  // Minimum KYC level to courier (unconditional — courier is a real role).
  await kyc.assertCourierKyc(email)
  await deliveryService.assertCourierCanOffer(email)

  const offer = await deliveryService.makeOffer({
    jobId: id,
    courierEmail: email,
    offeredPrice: body.offeredPrice,
  })
  res.status(201).json({ offer })
}

import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import DeliveryModuleService from "../../../../../modules/delivery/service"
import { DELIVERY_MODULE } from "../../../../../modules/delivery"
import type { MakeOfferInput } from "../../../../../modules/delivery/service"
import KycModuleService from "../../../../../modules/kyc/service"
import { KYC_MODULE } from "../../../../../modules/kyc"

// Any actor can make an offer or accept the posted price (email identity,
// matching the buyer-wallet pattern — couriers need no seller account).
// When the KYC courier gate is enabled (KYC_COURIER_GATE_ENABLED=true), the
// courier must be at least phone-verified to participate.
export const POST = async (
  req: MedusaRequest<MakeOfferInput>,
  res: MedusaResponse
) => {
  const { id } = req.params as { id: string }
  const body = req.validatedBody ?? (req.body as MakeOfferInput)
  const deliveryService = req.scope.resolve<DeliveryModuleService>(DELIVERY_MODULE)
  const kyc = req.scope.resolve<KycModuleService>(KYC_MODULE)

  if (kyc.courierGateEnabled()) {
    await kyc.assertCourierKyc(body.courierEmail)
  }

  const offer = await deliveryService.makeOffer({
    ...body,
    jobId: id,
  })
  res.status(201).json({ offer })
}

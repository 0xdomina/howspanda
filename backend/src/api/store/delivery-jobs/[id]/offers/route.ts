import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import DeliveryModuleService from "../../../../../modules/delivery/service"
import { DELIVERY_MODULE } from "../../../../../modules/delivery"
import type { MakeOfferInput } from "../../../../../modules/delivery/service"

// Any actor can make an offer or accept the posted price (email identity,
// matching the buyer-wallet pattern — couriers need no seller account).
export const POST = async (
  req: MedusaRequest<MakeOfferInput>,
  res: MedusaResponse
) => {
  const { id } = req.params as { id: string }
  const body = req.validatedBody ?? (req.body as MakeOfferInput)
  const deliveryService = req.scope.resolve<DeliveryModuleService>(DELIVERY_MODULE)
  const offer = await deliveryService.makeOffer({
    ...body,
    jobId: id,
  })
  res.status(201).json({ offer })
}

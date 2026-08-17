import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import MallModuleService from "../../../../../modules/mall/service"
import { MALL_MODULE } from "../../../../../modules/mall"
import { resolveActorEmail } from "../../../../../lib/accounts/resolve-actor-email"

// Buyers join with the same signed-in account they use to shop. There is no
// guest email path: otherwise anyone could inflate the fixed launch target
// with invented addresses.
export const POST = async (
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) => {
  const { id } = req.params as { id: string }
  const buyerEmail = await resolveActorEmail(req)

  const mallService = req.scope.resolve<MallModuleService>(MALL_MODULE)
  const buyer = await mallService.joinAsBuyer({
    mallId: id,
    buyerEmail,
  })

  res.status(201).json({ buyer })
}

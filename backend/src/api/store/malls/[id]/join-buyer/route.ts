import { MedusaError } from "@medusajs/framework/utils"
import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import MallModuleService from "../../../../../modules/mall/service"
import { MALL_MODULE } from "../../../../../modules/mall"

export const POST = async (
  req: MedusaRequest,
  res: MedusaResponse
) => {
  const { id } = req.params as { id: string }
  const body = req.validatedBody as { buyerEmail: string }

  if (!body?.buyerEmail) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "buyerEmail is required"
    )
  }

  const mallService = req.scope.resolve<MallModuleService>(MALL_MODULE)
  const buyer = await mallService.joinAsBuyer({
    mallId: id,
    buyerEmail: body.buyerEmail,
  })

  res.status(201).json({ buyer })
}

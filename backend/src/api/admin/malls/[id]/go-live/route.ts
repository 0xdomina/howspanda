import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import MallModuleService from "../../../../../modules/mall/service"
import { MALL_MODULE } from "../../../../../modules/mall"

export const POST = async (req: MedusaRequest, res: MedusaResponse) => {
  const { id } = req.params as { id: string }

  const mallService = req.scope.resolve<MallModuleService>(MALL_MODULE)
  const mall = await mallService.activate(id)

  res.json({ mall })
}

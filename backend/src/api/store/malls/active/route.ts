import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import MallModuleService from "../../../../modules/mall/service"
import { MALL_MODULE } from "../../../../modules/mall"

export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
  const mallService = req.scope.resolve<MallModuleService>(MALL_MODULE)
  const malls = await mallService.listActive()
  res.json({ malls })
}

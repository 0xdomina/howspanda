import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import MallModuleService from "../../../../modules/mall/service"
import { MALL_MODULE } from "../../../../modules/mall"
import { resolveActorEmail } from "../../../../lib/accounts/resolve-actor-email"

export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
  const { id } = req.params as { id: string }
  const mallService = req.scope.resolve<MallModuleService>(MALL_MODULE)
  const viewerEmail = (req as any).auth_context?.actor_id
    ? await resolveActorEmail(req).catch(() => null)
    : null
  const mall = await mallService.getDetails(id, viewerEmail)
  res.json({ mall })
}

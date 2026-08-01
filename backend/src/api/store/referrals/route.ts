import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { GROWTH_MODULE } from "../../../modules/growth"
import GrowthModuleService from "../../../modules/growth/service"

// The referee binds their email to a seller's share code. No money moves here —
// the reward only pays once that email's first transaction completes (escrow
// released), evaluated when the seller views their referrals.
export const POST = async (req: MedusaRequest, res: MedusaResponse) => {
  const { code, email } = req.validatedBody as { code: string; email: string }
  const growth = req.scope.resolve<GrowthModuleService>(GROWTH_MODULE)
  const referral = await growth.claimByCode(code, email)
  res.json({ referral })
}

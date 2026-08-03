import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { GROWTH_MODULE } from "../../../modules/growth"
import GrowthModuleService from "../../../modules/growth/service"
import { resolveAuthoritativeEmail } from "../../../lib/escrow/resolve-customer-email"

// The referee binds their email to a seller's share code. No money moves here —
// the reward only pays once that email's first transaction completes (escrow
// released), evaluated when the seller views their referrals. If the caller is
// an authenticated customer, their JWT email is authoritative (they can't claim
// a code for an arbitrary stranger's email).
export const POST = async (req: MedusaRequest, res: MedusaResponse) => {
  const body = req.validatedBody as { code: string; email: string }
  const email = await resolveAuthoritativeEmail(req, body.email)
  const growth = req.scope.resolve<GrowthModuleService>(GROWTH_MODULE)
  const referral = await growth.claimByCode(body.code, email)
  res.json({ referral })
}

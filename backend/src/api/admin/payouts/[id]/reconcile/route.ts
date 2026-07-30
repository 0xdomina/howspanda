import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { reconcilePayout } from "../../../../../lib/payments/payouts/reconcile"

// Poll this payout's rail right now and return the (possibly transitioned)
// payout — the on-demand version of the reconcile-payouts cron.
export const POST = async (req: MedusaRequest, res: MedusaResponse) => {
  const payout = await reconcilePayout(req.scope, req.params.id)

  res.json({ payout })
}

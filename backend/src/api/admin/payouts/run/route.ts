import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { runScheduledPayouts } from "../../../../lib/payments/payouts/run-scheduled"

// Manual trigger for the scheduled-payouts sweep — all sellers, or just one.
// Uses the same daily idempotency key, so re-running is a no-op for sellers
// already paid out today.
export const POST = async (req: MedusaRequest, res: MedusaResponse) => {
  const { seller_id } = (req.body ?? {}) as { seller_id?: string }

  const result = await runScheduledPayouts(
    req.scope,
    seller_id && typeof seller_id === "string" ? seller_id : undefined,
    "admin"
  )

  res.json(result)
}

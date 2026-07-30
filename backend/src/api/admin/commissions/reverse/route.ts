import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MedusaError } from "@medusajs/framework/utils"
import { MARKETPLACE_MODULE } from "../../../../modules/marketplace"
import MarketplaceModuleService from "../../../../modules/marketplace/service"

/**
 * Operational entry point for refunds/chargebacks: pull an order's commission
 * back out of the seller's balance (or offset it if already paid out).
 * Auto-wiring this to charge-refund webhooks is a later phase — the ledger
 * math is what Phase 5 locks in.
 */
export const POST = async (req: MedusaRequest, res: MedusaResponse) => {
  const { order_id, reason } = (req.body ?? {}) as {
    order_id?: string
    reason?: string
  }

  if (!order_id || typeof order_id !== "string") {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "order_id is required"
    )
  }

  const marketplace =
    req.scope.resolve<MarketplaceModuleService>(MARKETPLACE_MODULE)

  const commissionLine = await marketplace.reverseCommissionForOrder(
    order_id,
    reason && typeof reason === "string" ? reason : "admin reversal"
  )

  res.json({ commission_line: commissionLine })
}

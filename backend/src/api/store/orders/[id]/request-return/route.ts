import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MedusaError } from "@medusajs/framework/utils"
import { MARKETPLACE_MODULE } from "../../../../../modules/marketplace"
import MarketplaceModuleService from "../../../../../modules/marketplace/service"
import { assertOrderEmail } from "../../../../../lib/escrow/order-access"
import { isOrderNonReturnable } from "../../../../../lib/escrow/returnability"

// Buyer opens a return/complaint → escrow holds until the return resolves.
export const POST = async (req: MedusaRequest, res: MedusaResponse) => {
  const { email, reason } = req.validatedBody as {
    email: string
    reason: string
  }
  await assertOrderEmail(req.scope, req.params.id, email)

  if (await isOrderNonReturnable(req.scope, req.params.id)) {
    throw new MedusaError(
      MedusaError.Types.NOT_ALLOWED,
      "These items are non-returnable (sealed, perishable or personalized). " +
        "If the item arrived damaged or defective, contact support — defect " +
        "claims are always accepted."
    )
  }

  const marketplace: MarketplaceModuleService =
    req.scope.resolve(MARKETPLACE_MODULE)

  // undelivered orders may still be held (pre-delivery cancellation); once
  // delivered, the return window is the deadline
  const existing = await marketplace.resolveLinesForOrder(req.params.id)
  const now = new Date()
  const windowClosed = existing.some(
    (line) =>
      line.delivered_at &&
      line.release_due_at &&
      new Date(line.release_due_at) < now
  )
  if (windowClosed) {
    throw new MedusaError(
      MedusaError.Types.NOT_ALLOWED,
      "The return window has closed"
    )
  }

  const lines = await marketplace.holdForReturn(req.params.id, reason)

  res.json({ order_id: req.params.id, lines })
}

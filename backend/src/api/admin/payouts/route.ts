import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MARKETPLACE_MODULE } from "../../../modules/marketplace"
import MarketplaceModuleService from "../../../modules/marketplace/service"

// Ops view of every payout across sellers, filterable by status/seller.
export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
  const { status, seller_id } = req.query as {
    status?: string
    seller_id?: string
  }

  const filters: Record<string, unknown> = {}
  if (status) {
    filters.status = status
  }
  if (seller_id) {
    filters.seller_id = seller_id
  }

  const marketplace =
    req.scope.resolve<MarketplaceModuleService>(MARKETPLACE_MODULE)

  const payouts = await marketplace.listPayouts(filters, {
    order: { created_at: "DESC" },
    take: null,
  })

  res.json({ payouts })
}

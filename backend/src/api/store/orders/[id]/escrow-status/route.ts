import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import {
  ContainerRegistrationKeys,
  MedusaError,
} from "@medusajs/framework/utils"
import { MARKETPLACE_MODULE } from "../../../../../modules/marketplace"
import type MarketplaceModuleService from "../../../../../modules/marketplace/service"
import { assertOrderEmail } from "../../../../../lib/escrow/order-access"

// Buyer-facing escrow state for the order actions panel. Email is the
// ownership proof (same gate as every buyer action).
export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
  const email = (req.query.email as string) ?? ""
  await assertOrderEmail(req.scope, req.params.id, email)

  const marketplace =
    req.scope.resolve<MarketplaceModuleService>(MARKETPLACE_MODULE)
  const lines = await marketplace.resolveLinesForOrder(req.params.id)

  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const sellerIds = [...new Set(lines.map((l) => l.seller_id).filter(Boolean))]
  const { data: sellers } = sellerIds.length
    ? await query.graph({
        entity: "seller",
        fields: ["id", "name", "handle"],
        filters: { id: sellerIds },
      })
    : { data: [] }
  const sellerById = Object.fromEntries(
    sellers.map((s) => [s.id, { name: s.name, handle: s.handle }])
  )

  if (!lines.length) {
    throw new MedusaError(
      MedusaError.Types.NOT_FOUND,
      "This order is not a marketplace order"
    )
  }

  res.json({
    order_id: req.params.id,
    lines: lines.map((l) => ({
      id: l.id,
      seller_id: l.seller_id,
      seller: sellerById[l.seller_id as string] ?? null,
      status: l.status,
      net_amount: Number(l.net_amount),
      currency_code: l.currency_code,
      delivered_at: l.delivered_at,
      confirmed_at: l.confirmed_at,
      held_at: l.held_at,
      hold_reason: l.hold_reason,
      release_due_at: l.release_due_at,
    })),
  })
}

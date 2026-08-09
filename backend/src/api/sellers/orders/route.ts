import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import {
  ContainerRegistrationKeys,
  MedusaError,
} from "@medusajs/framework/utils"
import { getOrdersListWorkflow } from "@medusajs/medusa/core-flows"
import { MARKETPLACE_MODULE } from "../../../modules/marketplace"
import type MarketplaceModuleService from "../../../modules/marketplace/service"
import { requireSellerPermission } from "../../../lib/sellers/resolve-seller"

export const GET = async (
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) => {
  await requireSellerPermission(req, "orders")
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)

  const { data: [sellerAdmin] } = await query.graph({
    entity: "seller_admin",
    fields: ["seller.orders.*", "seller.id"],
    filters: {
      id: [req.auth_context.actor_id],
    },
  })

  if (!sellerAdmin) {
    throw new MedusaError(
      MedusaError.Types.UNAUTHORIZED,
      "Seller not found for authenticated actor"
    )
  }

  const orderIds = sellerAdmin.seller.orders?.map((order) => order?.id) || []

  if (!orderIds.length) {
    return res.json({ orders: [] })
  }

  const { result: orders } = await getOrdersListWorkflow(req.scope)
    .run({
      input: {
        fields: [
          "metadata",
          "total",
          "subtotal",
          "shipping_total",
          "tax_total",
          "items.*",
          "items.variant",
          "items.variant.product",
          "items.detail",
          "shipping_methods",
          "payment_collections",
          "fulfillments",
        ],
        variables: {
          filters: {
            id: orderIds,
          },
        },
      },
    })

  // Attach the seller's own commission line (escrow state) to each order so
  // the seller dashboard can show status and actions without a second call.
  const marketplace =
    req.scope.resolve<MarketplaceModuleService>(MARKETPLACE_MODULE)
  const lines = await marketplace.listCommissionLines(
    { order_id: orderIds, seller_id: sellerAdmin.seller.id },
    { take: null }
  )
  const lineByOrder = new Map(
    lines.map((line) => [
      line.order_id,
      {
        status: line.status,
        delivered_at: line.delivered_at,
        confirmed_at: line.confirmed_at,
        held_at: line.held_at,
        hold_reason: line.hold_reason,
        release_due_at: line.release_due_at,
        net_amount: Number(line.net_amount),
        currency_code: line.currency_code,
      },
    ])
  )

  const orderRows = Array.isArray(orders) ? orders : orders.rows

  res.json({
    orders: orderRows.map((order) => ({
      ...order,
      escrow: lineByOrder.get(order.id) ?? null,
    })),
  })
}

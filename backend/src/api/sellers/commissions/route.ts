import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"

export const GET = async (
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) => {
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)

  const { data: [sellerAdmin] } = await query.graph({
    entity: "seller_admin",
    fields: [
      "seller.id",
      "seller.commission_rate",
      "seller.commission_lines.*",
    ],
    filters: {
      id: [req.auth_context.actor_id],
    },
  })

  const lines = sellerAdmin.seller.commission_lines || []

  // simple aggregate so sellers see what they're owed at a glance
  const totals = lines.reduce(
    (acc, line) => {
      if (!line) {
        return acc
      }
      acc.gross += Number(line.order_total)
      acc.commission += Number(line.commission_amount)
      acc.net += Number(line.net_amount)
      return acc
    },
    { gross: 0, commission: 0, net: 0 }
  )

  res.json({
    commission_rate: sellerAdmin.seller.commission_rate,
    summary: totals,
    commission_lines: lines,
  })
}

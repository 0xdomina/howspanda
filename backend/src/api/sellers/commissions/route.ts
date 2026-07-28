import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import {
  ContainerRegistrationKeys,
  MedusaError,
} from "@medusajs/framework/utils"

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

  if (!sellerAdmin) {
    throw new MedusaError(
      MedusaError.Types.UNAUTHORIZED,
      "Seller not found for authenticated actor"
    )
  }

  const lines = sellerAdmin.seller.commission_lines || []

  // per-currency aggregate so sellers see what they're owed at a glance
  const summary = lines.reduce(
    (acc, line) => {
      if (!line) {
        return acc
      }
      const currency = line.currency_code
      acc[currency] ??= { gross: 0, commission: 0, net: 0 }
      acc[currency].gross += Number(line.order_total)
      acc[currency].commission += Number(line.commission_amount)
      acc[currency].net += Number(line.net_amount)
      return acc
    },
    {} as Record<string, { gross: number; commission: number; net: number }>
  )

  res.json({
    commission_rate: sellerAdmin.seller.commission_rate,
    summary,
    commission_lines: lines,
  })
}

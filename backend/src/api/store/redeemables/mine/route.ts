import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { REDEEMABLES_MODULE } from "../../../../modules/redeemables"
import RedeemablesModuleService from "../../../../modules/redeemables/service"
import { resolveCustomerEmail } from "../../../../lib/escrow/resolve-customer-email"

// A signed-in buyer's private pass wallet. The code is included only because
// this request is bound to the customer's JWT email; public store listings
// never expose bearer codes.
export const GET = async (
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) => {
  const email = (await resolveCustomerEmail(req)).trim().toLowerCase()
  const redeemables = req.scope.resolve<RedeemablesModuleService>(REDEEMABLES_MODULE)
  const items = await redeemables.listRedeemables(
    { issued_to_email: email },
    { order: { created_at: "DESC" } }
  )

  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const sellerIds = [...new Set(items.map((item) => item.seller_id))]
  const { data: sellers } = sellerIds.length
    ? await query.graph({
        entity: "seller",
        fields: ["id", "name", "handle", "logo"],
        filters: { id: sellerIds },
      })
    : { data: [] }
  const sellerById = new Map((sellers ?? []).map((seller: any) => [seller.id, seller]))

  res.json({
    redeemables: items.map((item) => ({
      ...item,
      store: sellerById.get(item.seller_id)
        ? {
            name: sellerById.get(item.seller_id).name,
            handle: sellerById.get(item.seller_id).handle,
            logo: sellerById.get(item.seller_id).logo ?? null,
          }
        : null,
    })),
  })
}

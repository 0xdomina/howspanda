import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import {
  ContainerRegistrationKeys,
  MedusaError,
} from "@medusajs/framework/utils"
import { MARKETPLACE_MODULE } from "../../../../../modules/marketplace"
import type MarketplaceModuleService from "../../../../../modules/marketplace/service"
import { assertOrderEmail } from "../../../../../lib/escrow/order-access"
import { toBankTransferView } from "../../../../../lib/bank-transfer/proof-view"

// Buyer view of their direct-to-seller bank transfer: the account to pay
// into, the narration reference, and the live proof status (incl. a
// rejection note + recheck deadline). Email is the ownership proof, same as
// every other guest buyer action.
export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
  const email = (req.query.email as string) ?? ""
  await assertOrderEmail(req.scope, req.params.id, email, req)

  const marketplace =
    req.scope.resolve<MarketplaceModuleService>(MARKETPLACE_MODULE)
  const proofs = await marketplace.listPaymentProofs(
    { order_id: req.params.id },
    { order: { created_at: "ASC" } }
  )

  if (!proofs.length) {
    throw new MedusaError(
      MedusaError.Types.NOT_FOUND,
      "This order was not paid by bank transfer"
    )
  }

  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const sellerIds = [...new Set(proofs.map((p) => p.seller_id).filter(Boolean))]
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

  res.json({
    order_id: req.params.id,
    transfers: proofs.map((proof) => ({
      ...toBankTransferView(proof),
      seller: sellerById[proof.seller_id as string] ?? null,
    })),
  })
}

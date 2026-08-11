import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { MARKETPLACE_MODULE } from "../../../../../../modules/marketplace"
import type MarketplaceModuleService from "../../../../../../modules/marketplace/service"
import { requireSellerPermission } from "../../../../../../lib/sellers/resolve-seller"
import { toBankTransferView } from "../../../../../../lib/bank-transfer/proof-view"
import { sendBankTransferNotice } from "../../../../../../lib/bank-transfer/notify"

// Seller confirms the buyer's bank transfer arrived. Also usable during the
// recheck window — a transfer that landed late can still be confirmed.
export const POST = async (
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) => {
  const context = await requireSellerPermission(req, "orders")
  const marketplace =
    req.scope.resolve<MarketplaceModuleService>(MARKETPLACE_MODULE)

  const proof = await marketplace.confirmBankTransferProof(
    req.params.id,
    context.sellerId
  )

  await sendBankTransferNotice(req.scope, {
    to: proof.buyer_email,
    recipient: "buyer",
    kind: "bank_transfer_confirmed",
    subject: "Your bank transfer was confirmed — the store is fulfilling your order",
    bodyHtml: `The store confirmed your bank transfer for order ${proof.order_id}. You'll get a notification when it ships. Reference: ${proof.reference}.`,
    payload: { order_id: proof.order_id, reference: proof.reference },
  })

  res.json({ order_id: req.params.id, transfer: toBankTransferView(proof) })
}

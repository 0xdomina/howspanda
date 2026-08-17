import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { MARKETPLACE_MODULE } from "../../../../../../modules/marketplace"
import type MarketplaceModuleService from "../../../../../../modules/marketplace/service"
import { requireSellerPermission } from "../../../../../../lib/sellers/resolve-seller"
import { toBankTransferView } from "../../../../../../lib/bank-transfer/proof-view"
import { sendBankTransferNotice } from "../../../../../../lib/bank-transfer/notify"

type PostBankProofRejectBody = { note: string }

// Seller rejects the buyer's proof with a note. This opens the recheck window
// instead of cancelling — the transfer may still be in flight (network delays),
// and both sides can still resolve it: the seller confirms if the money lands,
// the buyer re-uploads corrected proof.
export const POST = async (
  req: AuthenticatedMedusaRequest<PostBankProofRejectBody>,
  res: MedusaResponse
) => {
  const context = await requireSellerPermission(req, "orders")
  const marketplace =
    req.scope.resolve<MarketplaceModuleService>(MARKETPLACE_MODULE)

  const proof = await marketplace.rejectBankTransferProof(
    req.params.id,
    context.sellerId,
    req.validatedBody.note
  )

  await sendBankTransferNotice(req.scope, {
    to: proof.buyer_email,
    recipient: "buyer",
    kind: "bank_transfer_rejected",
    subject: "The store couldn't find your bank transfer",
    bodyHtml: `The store could not find the transfer for order ${proof.order_id}. Their note: "${proof.rejection_note}". If the money is still on its way, it can still be confirmed once it lands — or re-upload your proof on the order page.`,
    payload: {
      order_id: proof.order_id,
      rejection_note: proof.rejection_note,
    },
  })

  res.json({ order_id: req.params.id, transfer: await toBankTransferView(proof) })
}

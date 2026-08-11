import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MedusaError } from "@medusajs/framework/utils"
import { MARKETPLACE_MODULE } from "../../../../../modules/marketplace"
import type MarketplaceModuleService from "../../../../../modules/marketplace/service"
import { assertOrderEmail } from "../../../../../lib/escrow/order-access"
import { toBankTransferView } from "../../../../../lib/bank-transfer/proof-view"
import { sendBankTransferNotice } from "../../../../../lib/bank-transfer/notify"

type PostBankProofBody = {
  email: string
  reference: string
  proof_url?: string
  amount?: number
  note?: string
}

// Buyer submits proof of their direct bank transfer. The reference must match
// the one issued at checkout; a rejection (recheck window) can be re-submitted.
export const POST = async (
  req: MedusaRequest<PostBankProofBody>,
  res: MedusaResponse
) => {
  const { email } = req.validatedBody
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
  if (proofs.length > 1) {
    throw new MedusaError(
      MedusaError.Types.CONFLICT,
      "This order has more than one bank transfer — contact support"
    )
  }

  const proof = await marketplace.submitBankTransferProof(
    req.params.id,
    proofs[0].seller_id,
    {
      reference: req.validatedBody.reference,
      proofUrl: req.validatedBody.proof_url,
      amount: req.validatedBody.amount,
      note: req.validatedBody.note,
    }
  )

  await sendBankTransferNotice(req.scope, {
    to: proof.buyer_email,
    recipient: "buyer",
    kind: "bank_transfer_submitted",
    subject: "We got your transfer proof — pending the store's confirmation",
    bodyHtml: `Your bank transfer for order ${proof.order_id} is awaiting the store's confirmation. Reference: ${proof.reference}.`,
    payload: { order_id: proof.order_id, reference: proof.reference },
  })

  res.json({ order_id: req.params.id, transfer: toBankTransferView(proof) })
}

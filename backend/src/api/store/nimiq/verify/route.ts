import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MedusaError } from "@medusajs/framework/utils"
import { NIMIQ_MODULE } from "../../../../modules/nimiq"
import type NimiqModuleService from "../../../../modules/nimiq/service"

// Wallet paid → backend verifies on chain → quote marked paid. The signer
// address binds as payer identity and refund destination. Nothing is
// issued here; order creation from a paid quote is the complete endpoint.
export const POST = async (req: MedusaRequest, res: MedusaResponse) => {
  const body = (req.body ?? {}) as { quote_id?: string; tx_hash?: string; sender?: string }
  if (!body.quote_id || !body.tx_hash) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "Quote and transaction needed"
    )
  }
  const nimiq: NimiqModuleService = req.scope.resolve(NIMIQ_MODULE)
  const paid = await nimiq.verifyPayment({
    quoteId: body.quote_id,
    txHash: body.tx_hash,
    sender: body.sender,
  })
  res.json({
    quote_id: paid.id,
    status: "paid",
    reference: (paid as any).reference,
    verified_at: (paid as any).verified_at,
  })
}

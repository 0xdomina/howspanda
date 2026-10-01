import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MedusaError } from "@medusajs/framework/utils"
import { NIMIQ_MODULE } from "../../../../modules/nimiq"
import type NimiqModuleService from "../../../../modules/nimiq/service"

// Public quote lookup (no amounts the buyer shouldn't see — totals only).
export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
  const id = (req.query.id as string) ?? ""
  if (!id) {
    throw new MedusaError(MedusaError.Types.INVALID_DATA, "Quote id needed")
  }
  const nimiq: NimiqModuleService = req.scope.resolve(NIMIQ_MODULE)
  const quote = await nimiq.getQuote(id)
  if (!quote) {
    throw new MedusaError(MedusaError.Types.NOT_FOUND, "Quote not found")
  }
  res.json({
    quote_id: quote.id,
    status: quote.status,
    token: quote.token,
    network: quote.network,
    amount_token_base: (quote as any).amount_token_base?.toString() ?? null,
    amount_ngn_minor: (quote as any).amount_ngn_minor,
    merchant_address: quote.merchant_address,
    reference: quote.reference,
    expires_at: quote.expires_at,
  })
}

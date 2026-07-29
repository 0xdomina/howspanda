import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { rankProviders } from "../../../lib/payments/fees"

/**
 * GET /store/payment-options?amount=<minor>&currency=ngn
 *
 * Returns the enabled, fee-eligible payment providers ranked cheapest-first for
 * the given cart amount. `recommended: true` marks the lowest-fee option; the
 * storefront preselects it but the buyer may choose any listed provider. This
 * is a read-only quote — it never mutates the cart or a payment session.
 *
 * Amounts are in the currency's MINOR unit (kobo for NGN).
 */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const rawAmount = req.query.amount
  const amount = Number(rawAmount)
  const currency = String(req.query.currency ?? "ngn").toLowerCase()

  if (!Number.isFinite(amount) || amount <= 0) {
    return res.status(400).json({
      code: "invalid_amount",
      message: "Query param `amount` must be a positive number in minor units.",
    })
  }

  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)

  const { data: providers } = await query.graph({
    entity: "payment_provider",
    fields: ["id", "is_enabled"],
  })

  const enabledIds = (providers ?? [])
    .filter((p: any) => p?.is_enabled)
    .map((p: any) => p.id)

  const options = rankProviders(amount, enabledIds)

  res.json({ currency, amount, options })
}

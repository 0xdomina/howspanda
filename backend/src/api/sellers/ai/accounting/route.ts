import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { runAiRoute } from "../../../../lib/ai/run-ai-route"
import { writeAccountingDigest } from "../../../../lib/ai/capabilities"
import { getSellerCommissionLines } from "../../../../lib/ai/seller-context"

// Deterministic money math happens HERE in code; the model only turns the
// finished numbers into a plain-language digest.
function aggregate(lines: any[]) {
  const byCurrency: Record<
    string,
    { gross: number; commission: number; net: number; orders: number }
  > = {}
  const byMonth: Record<string, { gross: number; net: number }> = {}

  for (const line of lines) {
    const currency = line.currency_code
    byCurrency[currency] ??= { gross: 0, commission: 0, net: 0, orders: 0 }
    byCurrency[currency].gross += Number(line.order_total)
    byCurrency[currency].commission += Number(line.commission_amount)
    byCurrency[currency].net += Number(line.net_amount)
    byCurrency[currency].orders += 1

    const month = String(line.created_at).slice(0, 7)
    byMonth[month] ??= { gross: 0, net: 0 }
    byMonth[month].gross += Number(line.order_total)
    byMonth[month].net += Number(line.net_amount)
  }

  return { by_currency: byCurrency, by_month: byMonth }
}

export const POST = async (
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) => {
  await runAiRoute(req, res, "accounting", async ({ query, seller }) => {
    const lines = await getSellerCommissionLines(query, seller.seller_id)
    const aggregates = aggregate(lines)

    const output = await writeAccountingDigest({
      aggregatesJson: JSON.stringify(aggregates),
    })

    return { ...output, extra: { aggregates } }
  })
}

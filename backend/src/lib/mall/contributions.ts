import { randomUUID } from "node:crypto"
import { MedusaError } from "@medusajs/framework/utils"
import { MARKETPLACE_MODULE } from "../../modules/marketplace"
import type MarketplaceModuleService from "../../modules/marketplace/service"
import type { MedusaRequest } from "@medusajs/framework/http"

// Mall amounts are entered and displayed in naira; seller commission balances
// use kobo, like the rest of the marketplace ledger.
export const NGN_MINOR_MULTIPLIER = 100

const toMinor = (amountNgn: number) =>
  Math.round(Number(amountNgn) * NGN_MINOR_MULTIPLIER)

export async function debitSellerMallContribution(
  req: MedusaRequest,
  sellerId: string,
  amountNgn: number,
  reference?: string
): Promise<string> {
  const contributionReference = reference ?? randomUUID()
  const amountMinor = toMinor(amountNgn)
  if (!Number.isFinite(amountMinor) || amountMinor <= 0) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "Mall contribution must be a positive amount"
    )
  }

  const marketplace = req.scope.resolve<MarketplaceModuleService>(
    MARKETPLACE_MODULE
  )
  await marketplace.releaseDueLines()
  const balances = await marketplace.getSellerBalance(sellerId)
  const available = Number(balances.ngn?.available ?? 0)
  if (available < amountMinor) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "Your available store balance is too low for this contribution"
    )
  }

  const [line] = await marketplace.createCommissionLines([
    {
      order_id: `mall:contribution:${contributionReference}`,
      currency_code: "ngn",
      order_total: -amountMinor,
      rate: 0,
      commission_amount: 0,
      net_amount: -amountMinor,
      status: "available",
      available_at: new Date(),
      seller_id: sellerId,
    },
  ])

  if (!line?.id) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "Could not reserve the mall contribution"
    )
  }
  return line.id
}

export async function refundSellerMallContribution(
  req: MedusaRequest,
  sellerId: string,
  amountNgn: number,
  reference?: string
) {
  const refundReference = reference ?? randomUUID()
  const amountMinor = toMinor(amountNgn)
  if (amountMinor <= 0) return null
  const marketplace = req.scope.resolve<MarketplaceModuleService>(
    MARKETPLACE_MODULE
  )
  const [line] = await marketplace.createCommissionLines([
    {
      order_id: `mall:contribution-refund:${refundReference}`,
      currency_code: "ngn",
      order_total: amountMinor,
      rate: 0,
      commission_amount: 0,
      net_amount: amountMinor,
      status: "available",
      available_at: new Date(),
      seller_id: sellerId,
    },
  ])
  return line ?? null
}

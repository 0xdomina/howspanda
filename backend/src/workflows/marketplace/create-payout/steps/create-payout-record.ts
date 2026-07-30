import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk"
import MarketplaceModuleService from "../../../../modules/marketplace/service"
import { MARKETPLACE_MODULE } from "../../../../modules/marketplace"

export type PayoutDestination = {
  type: "bank_account" | "crypto_address"
  bank_code?: string
  account_number?: string
  account_name?: string
  recipient_code?: string
  network?: string
  address?: string
}

type StepInput = {
  payout_id: string
  seller_id: string
  amount: number
  rail: "paystack" | "crypto-usdc"
  idempotency_key: string
  destination: PayoutDestination
  requested_by: "seller" | "admin" | "schedule"
}

/**
 * Create the payout row (`requested`) with the destination snapshotted, so
 * history survives later account edits. Compensation deletes the row —
 * soft-delete frees the unique idempotency key for a clean retry.
 */
const createPayoutRecordStep = createStep(
  "create-payout-record",
  async (input: StepInput, { container }) => {
    const marketplace: MarketplaceModuleService =
      container.resolve(MARKETPLACE_MODULE)

    const payout = await marketplace.createPayouts({
      id: input.payout_id,
      seller_id: input.seller_id,
      currency_code: "ngn",
      amount: input.amount,
      rail: input.rail,
      status: "requested",
      idempotency_key: input.idempotency_key,
      destination: input.destination,
      requested_by: input.requested_by,
    })

    return new StepResponse(payout, payout.id)
  },
  async (payoutId, { container }) => {
    if (!payoutId) {
      return
    }

    const marketplace: MarketplaceModuleService =
      container.resolve(MARKETPLACE_MODULE)

    await marketplace.deletePayouts([payoutId])
  }
)

export default createPayoutRecordStep

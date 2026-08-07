import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk"
import { MedusaError } from "@medusajs/framework/utils"
import MarketplaceModuleService from "../../../../modules/marketplace/service"
import { MARKETPLACE_MODULE } from "../../../../modules/marketplace"
import { initiateTransfer } from "../../../../lib/payments/payouts/paystack-transfers"
import {
  getCryptoSettlement,
  quoteUsdc,
} from "../../../../lib/payments/crypto"
import { PayoutDestination } from "./create-payout-record"

type StepInput = {
  payout_id: string
  rail: "paystack" | "crypto-usdc"
  amount: number
  destination: PayoutDestination
}

/**
 * Hand the money to the rail. The provider-side reference is ALWAYS the
 * payout id — Paystack rejects duplicate references, so a crashed-and-replayed
 * workflow can never double-pay. On throw the earlier compensations run
 * (lines released, row deleted); on success the payout flips to `processing`.
 */
const initiatePayoutTransferStep = createStep(
  "initiate-payout-transfer",
  async (input: StepInput, { container }) => {
    const marketplace: MarketplaceModuleService =
      container.resolve(MARKETPLACE_MODULE)

    let providerReference: string

    if (input.rail === "paystack") {
      if (!input.destination.recipient_code) {
        throw new MedusaError(
          MedusaError.Types.INVALID_DATA,
          "Payout destination has no Paystack recipient_code"
        )
      }
      const transfer = await initiateTransfer({
        amount: input.amount,
        recipient_code: input.destination.recipient_code,
        reference: input.payout_id,
        reason: "How's u seller payout",
      })
      providerReference = transfer.transfer_code
    } else {
      if (!input.destination.address) {
        throw new MedusaError(
          MedusaError.Types.INVALID_DATA,
          "Payout destination has no crypto address"
        )
      }
      const settlement = getCryptoSettlement(input.destination.network)
      const withdrawal = await settlement.createWithdrawal({
        reference: input.payout_id,
        address: input.destination.address,
        // Payout amounts are kobo (minor unit); quoteUsdc expects naira.
        usdc_amount: quoteUsdc(input.amount / 100),
      })
      providerReference = withdrawal.reference
    }

    const [payout] = await marketplace.updatePayouts([
      {
        id: input.payout_id,
        status: "processing" as const,
        provider_reference: providerReference,
        attempts: 1,
      },
    ])

    return new StepResponse(payout)
  }
)

export default initiatePayoutTransferStep

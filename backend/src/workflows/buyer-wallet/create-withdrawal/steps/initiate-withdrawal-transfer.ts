import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk"
import { MedusaError } from "@medusajs/framework/utils"
import BuyerWalletModuleService from "../../../../modules/buyer-wallet/service"
import { BUYER_WALLET_MODULE } from "../../../../modules/buyer-wallet"
import { initiateTransfer } from "../../../../lib/payments/payouts/paystack-transfers"
import {
  getCryptoSettlement,
  quoteUsdc,
} from "../../../../lib/payments/crypto"
import { WithdrawalDestination } from "./prepare-withdrawal"

type StepInput = {
  withdrawal_id: string
  rail: "paystack" | "crypto-usdc"
  amount: number
  destination: WithdrawalDestination
}

/**
 * Hand the money to the rail. The provider-side reference is ALWAYS the
 * withdrawal id — Paystack rejects duplicate references, so a crashed-and-
 * replayed workflow can never double-pay. On throw the earlier compensations
 * run (wallet credited back, row deleted); on success the withdrawal flips to
 * `processing`.
 */
const initiateWithdrawalTransferStep = createStep(
  "initiate-buyer-withdrawal-transfer",
  async (input: StepInput, { container }) => {
    const buyerWallet: BuyerWalletModuleService =
      container.resolve(BUYER_WALLET_MODULE)

    let providerReference: string

    if (input.rail === "paystack") {
      if (!input.destination.recipient_code) {
        throw new MedusaError(
          MedusaError.Types.INVALID_DATA,
          "Withdrawal destination has no Paystack recipient_code"
        )
      }
      const transfer = await initiateTransfer({
        amount_major: input.amount,
        recipient_code: input.destination.recipient_code,
        reference: input.withdrawal_id,
        reason: "How's u buyer wallet withdrawal",
      })
      providerReference = transfer.transfer_code
    } else {
      if (!input.destination.address) {
        throw new MedusaError(
          MedusaError.Types.INVALID_DATA,
          "Withdrawal destination has no crypto address"
        )
      }
      const settlement = getCryptoSettlement(input.destination.network)
      const withdrawal = await settlement.createWithdrawal({
        reference: input.withdrawal_id,
        address: input.destination.address,
        usdc_amount: quoteUsdc(input.amount),
      })
      providerReference = withdrawal.reference
    }

    const [updated] = await buyerWallet.updateBuyerWithdrawals([
      {
        id: input.withdrawal_id,
        status: "processing" as const,
        provider_reference: providerReference,
        attempts: 1,
      },
    ])

    return new StepResponse(updated)
  }
)

export default initiateWithdrawalTransferStep

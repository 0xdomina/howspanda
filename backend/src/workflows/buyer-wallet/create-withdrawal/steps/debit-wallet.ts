import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk"
import BuyerWalletModuleService from "../../../../modules/buyer-wallet/service"
import { BUYER_WALLET_MODULE } from "../../../../modules/buyer-wallet"

type StepInput = {
  buyer_email: string
  withdrawal_id: string
  amount: number
}

/**
 * Debit the wallet as the withdrawal is requested — the money leaves the
 * buyer-visible balance the moment the rail is engaged. Compensation credits
 * it back if a later step fails.
 */
const debitWalletStep = createStep(
  "debit-buyer-wallet",
  async (input: StepInput, { container }) => {
    const buyerWallet: BuyerWalletModuleService =
      container.resolve(BUYER_WALLET_MODULE)

    const { wallet } = await buyerWallet.debit({
      buyerEmail: input.buyer_email,
      amount: input.amount,
      source: "withdrawal",
      reference: input.withdrawal_id,
    })

    return new StepResponse(wallet, {
      buyer_email: input.buyer_email,
      amount: input.amount,
      withdrawal_id: input.withdrawal_id,
    })
  },
  async (input: any, { container }: any) => {
    if (!input) {
      return
    }
    const buyerWallet: BuyerWalletModuleService =
      container.resolve(BUYER_WALLET_MODULE)
    await buyerWallet.credit({
      buyerEmail: input.buyer_email,
      amount: input.amount,
      source: "adjustment",
      reference: input.withdrawal_id,
    })
  }
)

export default debitWalletStep

import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk"
import BuyerWalletModuleService from "../../../../modules/buyer-wallet/service"
import { BUYER_WALLET_MODULE } from "../../../../modules/buyer-wallet"
import { WithdrawalDestination } from "./prepare-withdrawal"

type StepInput = {
  withdrawal_id: string
  buyer_email: string
  amount: number
  rail: "paystack" | "crypto-usdc"
  idempotency_key: string
  destination: WithdrawalDestination
}

/**
 * Create the withdrawal row (`requested`) with the destination snapshotted,
 * so history survives later account edits. Compensation deletes the row —
 * soft-delete frees the unique idempotency key for a clean retry.
 */
const createWithdrawalRecordStep = createStep(
  "create-buyer-withdrawal-record",
  async (input: StepInput, { container }) => {
    const buyerWallet: BuyerWalletModuleService =
      container.resolve(BUYER_WALLET_MODULE)

    const [wallet] = await buyerWallet.listWallets({
      buyer_email: input.buyer_email,
    })
    if (!wallet) {
      throw new Error(`No wallet for buyer ${input.buyer_email}`)
    }

    const withdrawal = await buyerWallet.createBuyerWithdrawals({
      id: input.withdrawal_id,
      wallet: wallet.id,
      currency_code: "ngn",
      amount: input.amount,
      rail: input.rail,
      status: "requested",
      idempotency_key: input.idempotency_key,
      destination: input.destination,
    })

    return new StepResponse(withdrawal, input.withdrawal_id)
  },
  async (withdrawalId, { container }) => {
    if (!withdrawalId) {
      return
    }
    const buyerWallet: BuyerWalletModuleService =
      container.resolve(BUYER_WALLET_MODULE)
    await buyerWallet.deleteBuyerWithdrawals([withdrawalId])
  }
)

export default createWithdrawalRecordStep

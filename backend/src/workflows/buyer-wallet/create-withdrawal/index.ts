import {
  createStep,
  createWorkflow,
  StepResponse,
  transform,
  when,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk"
import BuyerWalletModuleService from "../../../modules/buyer-wallet/service"
import { BUYER_WALLET_MODULE } from "../../../modules/buyer-wallet"
import prepareWithdrawalStep from "./steps/prepare-withdrawal"
import debitWalletStep from "./steps/debit-wallet"
import createWithdrawalRecordStep from "./steps/create-withdrawal-record"
import initiateWithdrawalTransferStep from "./steps/initiate-withdrawal-transfer"

export type CreateBuyerWithdrawalWorkflowInput = {
  buyer_email: string
  rail: "paystack" | "crypto-usdc"
  amount: number
  idempotency_key: string
}

// Idempotency guard — checked FIRST, mirroring create-payout: a replayed key
// returns the existing withdrawal untouched.
const getExistingWithdrawalStep = createStep(
  "get-existing-buyer-withdrawal",
  async (
    { idempotency_key }: { idempotency_key: string },
    { container }
  ) => {
    const buyerWallet: BuyerWalletModuleService =
      container.resolve(BUYER_WALLET_MODULE)

    const [existing] = await buyerWallet.listBuyerWithdrawals({
      idempotency_key,
    })
    return new StepResponse(existing ?? null)
  }
)

/**
 * Money-out workflow: idempotency guard → prepare (account + minimum) →
 * debit wallet → withdrawal row → hand to rail. Any step failure runs the
 * compensations (wallet credited back, row deleted) so a failed attempt
 * leaves zero withdrawal rows and the full balance back in the wallet.
 */
const createBuyerWithdrawalWorkflow = createWorkflow(
  "create-buyer-withdrawal",
  (input: CreateBuyerWithdrawalWorkflowInput) => {
    const existing = getExistingWithdrawalStep({
      idempotency_key: input.idempotency_key,
    })

    const created = when(
      "withdrawal-key-unused",
      { existing },
      (data) => !data.existing
    ).then(() => {
      const prep = prepareWithdrawalStep({
        buyer_email: input.buyer_email,
        rail: input.rail,
        amount: input.amount,
      })

      debitWalletStep({
        buyer_email: input.buyer_email,
        withdrawal_id: prep.withdrawal_id,
        amount: prep.amount,
      })

      createWithdrawalRecordStep({
        withdrawal_id: prep.withdrawal_id,
        buyer_email: input.buyer_email,
        amount: prep.amount,
        rail: input.rail,
        idempotency_key: input.idempotency_key,
        destination: prep.destination,
      })

      return initiateWithdrawalTransferStep({
        withdrawal_id: prep.withdrawal_id,
        rail: input.rail,
        amount: prep.amount,
        destination: prep.destination,
      })
    })

    const withdrawal = transform({ existing, created }, (data) => {
      return data.existing ?? data.created
    })

    return new WorkflowResponse(withdrawal)
  }
)

export default createBuyerWithdrawalWorkflow

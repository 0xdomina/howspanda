import { randomUUID } from "node:crypto"
import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk"
import { MedusaError } from "@medusajs/framework/utils"
import BuyerWalletModuleService from "../../../../modules/buyer-wallet/service"
import { BUYER_WALLET_MODULE } from "../../../../modules/buyer-wallet"

export type WithdrawalDestination = {
  type: "bank_account" | "crypto_address"
  bank_code?: string
  account_number?: string
  account_name?: string
  recipient_code?: string
  network?: string
  address?: string
}

type StepInput = {
  buyer_email: string
  rail: "paystack" | "crypto-usdc"
  amount: number
}

/**
 * Resolve the wallet, find the rail's default verified withdrawal account,
 * and enforce the withdrawal minimum against the requested amount.
 */
const prepareWithdrawalStep = createStep(
  "prepare-buyer-withdrawal",
  async (input: StepInput, { container }) => {
    const buyerWallet: BuyerWalletModuleService =
      container.resolve(BUYER_WALLET_MODULE)

    const accountType =
      input.rail === "paystack" ? "bank_account" : "crypto_address"
    const [account] = await buyerWallet.listBuyerWithdrawalAccounts({
      buyer_email: input.buyer_email,
      type: accountType,
      status: "verified",
      is_default: true,
    })
    if (!account) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        `Buyer has no default verified ${accountType} withdrawal account for rail ${input.rail}`
      )
    }

    const balance = await buyerWallet.balance(input.buyer_email)
    if (balance < input.amount - 0.001) {
      throw new MedusaError(
        MedusaError.Types.NOT_ALLOWED,
        `Buyer wallet balance (${balance}) is below the requested withdrawal (${input.amount})`
      )
    }

    const minimum = buyerWallet.withdrawalMinNgn()
    if (input.amount < minimum) {
      throw new MedusaError(
        MedusaError.Types.NOT_ALLOWED,
        `Withdrawal amount (${input.amount}) is below the minimum (${minimum})`
      )
    }

    const destination: WithdrawalDestination =
      account.type === "bank_account"
        ? {
            type: "bank_account",
            bank_code: account.bank_code ?? undefined,
            account_number: account.account_number ?? undefined,
            account_name: account.account_name ?? undefined,
            recipient_code: account.recipient_code ?? undefined,
          }
        : {
            type: "crypto_address",
            network: account.network ?? undefined,
            address: account.address ?? undefined,
          }

    return new StepResponse({
      withdrawal_id: `bw_${randomUUID().replace(/-/g, "")}`,
      amount: Math.round(input.amount * 100) / 100,
      destination,
    })
  }
)

export default prepareWithdrawalStep

import { MedusaError } from "@medusajs/framework/utils"
import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import BuyerWalletModuleService from "../../../../modules/buyer-wallet/service"
import { BUYER_WALLET_MODULE } from "../../../../modules/buyer-wallet"
import {
  PaystackTransferError,
  createRecipient,
  resolveAccount,
} from "../../../../lib/payments/payouts/paystack-transfers"
import { PostWalletWithdrawalAccountSchema } from "../../../middlewares"
import { z } from "@medusajs/framework/zod"

type PostWalletWithdrawalAccountBody = z.infer<
  typeof PostWalletWithdrawalAccountSchema
>

// Minimal shape validation only — a bank account is verified by Paystack's
// name resolve; a crypto address is ultimately verified by the transfer itself.
const BASE_ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/
const SOLANA_ADDRESS_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/

export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
  const email = String(req.query.email ?? "")
  if (!email) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "email query param is required"
    )
  }

  const buyerWallet =
    req.scope.resolve<BuyerWalletModuleService>(BUYER_WALLET_MODULE)

  const accounts = await buyerWallet.listBuyerWithdrawalAccounts(
    { buyer_email: email },
    { order: { created_at: "ASC" } }
  )

  res.json({ withdrawal_accounts: accounts })
}

export const POST = async (
  req: MedusaRequest<PostWalletWithdrawalAccountBody>,
  res: MedusaResponse
) => {
  const buyerWallet =
    req.scope.resolve<BuyerWalletModuleService>(BUYER_WALLET_MODULE)
  const body = req.validatedBody
  const email = body.buyerEmail.trim().toLowerCase()

  if (body.type === "bank_account") {
    if (!body.bank_code || !body.account_number) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "bank_code and account_number are required for a bank account"
      )
    }

    // First account of its type becomes the default destination for that rail.
    const existingOfType = await buyerWallet.listBuyerWithdrawalAccounts({
      buyer_email: email,
      type: body.type,
    })
    const isDefault = existingOfType.length === 0

    // Resolve the account name first — a failed resolve stores NOTHING.
    let accountName: string
    try {
      const resolved = await resolveAccount(
        body.account_number,
        body.bank_code
      )
      accountName = resolved.account_name
    } catch (e) {
      if (e instanceof PaystackTransferError) {
        throw new MedusaError(MedusaError.Types.INVALID_DATA, e.message)
      }
      throw e
    }

    const { recipient_code } = await createRecipient({
      name: accountName,
      account_number: body.account_number,
      bank_code: body.bank_code,
    })

    const account = await buyerWallet.createBuyerWithdrawalAccounts({
      buyer_email: email,
      type: "bank_account",
      currency_code: "ngn",
      bank_code: body.bank_code,
      account_number: body.account_number,
      account_name: accountName,
      recipient_code,
      is_default: isDefault,
      status: "verified",
    })

    return res.status(201).json({ withdrawal_account: account })
  }

  // crypto_address
  const addressOk = body.network
    ? body.network === "base"
      ? BASE_ADDRESS_RE.test(body.address ?? "")
      : SOLANA_ADDRESS_RE.test(body.address ?? "")
    : false

  if (!addressOk) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      `Invalid ${body.network} address format`
    )
  }

  const existingOfType = await buyerWallet.listBuyerWithdrawalAccounts({
    buyer_email: email,
    type: body.type,
  })

  const account = await buyerWallet.createBuyerWithdrawalAccounts({
    buyer_email: email,
    type: "crypto_address",
    currency_code: "usdc",
    network: body.network,
    address: body.address,
    is_default: existingOfType.length === 0,
    status: "verified",
  })

  res.status(201).json({ withdrawal_account: account })
}

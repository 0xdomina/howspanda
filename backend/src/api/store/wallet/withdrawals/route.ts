import { randomUUID } from "node:crypto"
import { MedusaError } from "@medusajs/framework/utils"
import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import BuyerWalletModuleService from "../../../../modules/buyer-wallet/service"
import { BUYER_WALLET_MODULE } from "../../../../modules/buyer-wallet"
import createBuyerWithdrawalWorkflow from "../../../../workflows/buyer-wallet/create-withdrawal"
import { PostWalletWithdrawalSchema } from "../../../middlewares"
import { z } from "@medusajs/framework/zod"

type PostWalletWithdrawalBody = z.infer<typeof PostWalletWithdrawalSchema>

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

  const [wallet] = await buyerWallet.listWallets({ buyer_email: email })
  const withdrawals = wallet
    ? await buyerWallet.listBuyerWithdrawals(
        { wallet: wallet.id },
        { order: { created_at: "DESC" } }
      )
    : []

  res.json({ withdrawals })
}

export const POST = async (
  req: MedusaRequest<PostWalletWithdrawalBody>,
  res: MedusaResponse
) => {
  const buyerWallet =
    req.scope.resolve<BuyerWalletModuleService>(BUYER_WALLET_MODULE)
  const body = req.validatedBody
  const email = body.buyerEmail.trim().toLowerCase()

  // Replaying the same idempotency_key returns the SAME withdrawal — the
  // workflow's guard short-circuits before any step touches the ledger.
  const idempotencyKey =
    body.idempotency_key ?? `bw-req-${randomUUID().replace(/-/g, "")}`

  const { result: withdrawal } = await createBuyerWithdrawalWorkflow(
    req.scope
  ).run({
    input: {
      buyer_email: email,
      rail: body.rail,
      amount: body.amount,
      idempotency_key: idempotencyKey,
    },
  })

  res.json({ withdrawal })
}

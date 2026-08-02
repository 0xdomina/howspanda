import { MedusaError } from "@medusajs/framework/utils"
import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import BuyerWalletModuleService from "../../../modules/buyer-wallet/service"
import { BUYER_WALLET_MODULE } from "../../../modules/buyer-wallet"

// Buyer wallet summary: balance + append-only ledger. The email query param
// is the ownership proof (store wallet credit routes use it in the body).
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

  const balance = await buyerWallet.balance(email)
  const ledger = await buyerWallet.listLedger(email)
  const minimum = buyerWallet.withdrawalMinNgn()

  res.json({ balance, minimum_ngn: minimum, ledger })
}

import { MedusaResponse } from "@medusajs/framework/http"
import { AuthenticatedMedusaRequest } from "@medusajs/framework/http"
import BuyerWalletModuleService from "../../../modules/buyer-wallet/service"
import { BUYER_WALLET_MODULE } from "../../../modules/buyer-wallet"
import { resolveCustomerEmail } from "../../../lib/escrow/resolve-customer-email"

// Buyer wallet summary: balance + append-only ledger. Requires an authenticated
// customer; the email is resolved from the JWT actor, never trusted from the
// request (the old email query param allowed draining any known email).
export const GET = async (
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) => {
  const email = await resolveCustomerEmail(req)

  const buyerWallet =
    req.scope.resolve<BuyerWalletModuleService>(BUYER_WALLET_MODULE)

  const balance = await buyerWallet.balance(email)
  const ledger = await buyerWallet.listLedger(email)
  const minimum = buyerWallet.withdrawalMinNgn()

  res.json({ balance, minimum_ngn: minimum, ledger })
}

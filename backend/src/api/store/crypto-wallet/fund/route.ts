import { MedusaResponse } from "@medusajs/framework/http"
import { AuthenticatedMedusaRequest } from "@medusajs/framework/http"
import { MedusaError } from "@medusajs/framework/utils"
import UserWalletModuleService from "../../../../modules/user-wallet/service"
import { USER_WALLET_MODULE } from "../../../../modules/user-wallet"
import { PostCryptoWalletFundSchema } from "../../../middlewares"
import { z } from "@medusajs/framework/zod"
import { getUserWalletSigner } from "../../../../lib/payments/wallets"
import { MockUserWalletSigner, mockFundWallet } from "../../../../lib/payments/wallets/mock"

type PostCryptoWalletFundBody = z.infer<typeof PostCryptoWalletFundSchema>

// DEV/MOCK ONLY top-up: credits the customer's managed wallet with test USDC.
// The live signer (Arc) is real money — funding there must come from the
// faucet/on-ramp, never a store route. This route refuses to run against a
// live signer, so it can never credit real funds.
export const POST = async (
  req: AuthenticatedMedusaRequest<PostCryptoWalletFundBody>,
  res: MedusaResponse
) => {
  const actorId = req.auth_context.actor_id
  if (!actorId) {
    throw new MedusaError(
      MedusaError.Types.UNAUTHORIZED,
      "Authentication required"
    )
  }

  const signer = getUserWalletSigner()
  if (!(signer instanceof MockUserWalletSigner)) {
    throw new MedusaError(
      MedusaError.Types.NOT_ALLOWED,
      "Mock funding is only available in mock mode"
    )
  }

  const walletModule =
    req.scope.resolve<UserWalletModuleService>(USER_WALLET_MODULE)
  const { wallet } = await walletModule.getOrCreateWallet({
    actor_type: "customer",
    actor_id: actorId,
    wallet_key: actorId,
  })

  const amount = req.validatedBody.amount.toFixed(2)
  mockFundWallet(wallet.address, amount)

  const balance_usdc = await signer.balanceOf(wallet.address)
  res.json({ wallet: { address: wallet.address }, balance_usdc })
}

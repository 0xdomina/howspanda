import { MedusaResponse } from "@medusajs/framework/http"
import { AuthenticatedMedusaRequest } from "@medusajs/framework/http"
import UserWalletModuleService from "../../../modules/user-wallet/service"
import { USER_WALLET_MODULE } from "../../../modules/user-wallet"
import { MedusaError } from "@medusajs/framework/utils"

export const GET = async (
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) => {
  const actorId = req.auth_context.actor_id
  if (!actorId) {
    throw new MedusaError(
      MedusaError.Types.UNAUTHORIZED,
      "Authentication required"
    )
  }

  const walletModule =
    req.scope.resolve<UserWalletModuleService>(USER_WALLET_MODULE)

  // getOrCreate so existing customers (created before the wallet feature)
  // lazily get their wallet on first view instead of 404-ing.
  const { wallet, balance_usdc } = await walletModule.getOrCreateWallet({
    actor_type: "customer",
    actor_id: actorId,
    wallet_key: actorId,
  })

  res.json({
    wallet: {
      network: wallet.network,
      env: wallet.env,
      address: wallet.address,
    },
    balance_usdc,
  })
}

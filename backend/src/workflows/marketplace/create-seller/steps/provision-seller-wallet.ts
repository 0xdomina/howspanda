import {
  createStep,
  StepResponse,
} from "@medusajs/framework/workflows-sdk"
import UserWalletModuleService from "../../../../modules/user-wallet/service"
import { USER_WALLET_MODULE } from "../../../../modules/user-wallet"

type ProvisionSellerWalletStepInput = {
  seller_id: string
  seller_admin_id: string
}

// Provision the seller's platform-managed USDC wallet. Keyed on the seller
// admin id so it stays stable if seller details are edited; the row holds only
// the public address + actor binding (private key never persisted).
const provisionSellerWalletStep = createStep(
  "provision-seller-wallet-step",
  async (input: ProvisionSellerWalletStepInput, { container }) => {
    const wallet: UserWalletModuleService = container.resolve(USER_WALLET_MODULE)
    const { wallet: view } = await wallet.getOrCreateWallet({
      actor_type: "seller",
      actor_id: input.seller_admin_id,
      wallet_key: input.seller_admin_id,
    })

    return new StepResponse(view.address)
  }
)

export default provisionSellerWalletStep

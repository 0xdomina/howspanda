import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { USER_WALLET_MODULE } from "../modules/user-wallet"
import UserWalletModuleService from "../modules/user-wallet/service"

// Every customer gets a platform-managed USDC wallet at signup: the address is
// derived from the master key and the row stores only the public address +
// actor binding (the private key is never persisted). Failure is logged, never
// thrown — signup must always succeed even if wallet provisioning lags.
export default async function customerCreatedWalletHandler({
  event: { data },
  container,
}: SubscriberArgs<{ id: string }>) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  try {
    const walletModule =
      container.resolve<UserWalletModuleService>(USER_WALLET_MODULE)
    await walletModule.getOrCreateWallet({
      actor_type: "customer",
      actor_id: data.id,
      wallet_key: data.id,
    })
  } catch (e) {
    logger.warn(
      `user-wallet provisioning failed for customer ${data.id}: ${e}`
    )
  }
}

export const config: SubscriberConfig = {
  event: "customer.created",
}

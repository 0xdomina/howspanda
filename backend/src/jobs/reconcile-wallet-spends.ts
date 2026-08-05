import { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import UserWalletModuleService from "../modules/user-wallet/service"
import { USER_WALLET_MODULE } from "../modules/user-wallet"

// Sweep every `signed` wallet spend through reconcileSpend — the safety net
// that turns broadcast transfers into confirmed/failed rows even when the
// requesting process dies between signing and polling. Gated with the same
// schedule flag the payout reconcilers use so offline environments stay quiet.
export default async function reconcileWalletSpendsJob(
  container: MedusaContainer
) {
  if (process.env.WALLET_RECONCILE_ENABLED !== "true") {
    return
  }

  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const walletModule = container.resolve<UserWalletModuleService>(
    USER_WALLET_MODULE
  )

  const signed = await walletModule.listWalletSpends(
    { status: "signed" },
    { take: null }
  )

  let confirmed = 0
  let failed = 0
  for (const spend of signed) {
    try {
      const updated = await walletModule.reconcileSpend({ id: spend.id })
      if (updated.status === "confirmed") {
        confirmed += 1
      } else if (updated.status === "failed") {
        failed += 1
      }
    } catch {
      // chain hiccup — leave it signed, retry next run
    }
  }

  if (signed.length > 0) {
    logger.info(
      `reconcile-wallet-spends: checked ${signed.length}, ` +
        `confirmed ${confirmed}, failed ${failed}`
    )
  }
}

export const config = {
  name: "reconcile-wallet-spends",
  schedule: "*/5 * * * *",
}

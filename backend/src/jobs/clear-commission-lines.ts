import { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { MARKETPLACE_MODULE } from "../modules/marketplace"
import MarketplaceModuleService from "../modules/marketplace/service"

// Always on: the clearance window is what moves money from `pending` to
// `available`, whether or not scheduled payouts are enabled.
export default async function clearCommissionLinesJob(
  container: MedusaContainer
) {
  const marketplace =
    container.resolve<MarketplaceModuleService>(MARKETPLACE_MODULE)
  const cleared = await marketplace.clearPendingLines()

  if (cleared > 0) {
    const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
    logger.info(
      `clear-commission-lines: ${cleared} commission line(s) now available`
    )
  }
}

export const config = {
  name: "clear-commission-lines",
  schedule: "0 * * * *",
}

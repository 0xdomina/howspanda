import { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { MARKETPLACE_MODULE } from "../modules/marketplace"
import MarketplaceModuleService from "../modules/marketplace/service"

// Always on: the escrow sweep is what moves money from `pending` to
// `available` — expired return windows plus the never-delivered fallback —
// whether or not scheduled payouts are enabled.
export default async function releaseEscrowLinesJob(
  container: MedusaContainer
) {
  const marketplace =
    container.resolve<MarketplaceModuleService>(MARKETPLACE_MODULE)
  const released = await marketplace.releaseDueLines()

  if (released > 0) {
    const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
    logger.info(
      `release-escrow-lines: ${released} commission line(s) now available`
    )
  }
}

export const config = {
  name: "release-escrow-lines",
  schedule: "0 * * * *",
}

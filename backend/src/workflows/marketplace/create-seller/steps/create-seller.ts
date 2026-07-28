import {
  createStep,
  StepResponse,
} from "@medusajs/framework/workflows-sdk"
import { MARKETPLACE_MODULE } from "../../../../modules/marketplace"
import MarketplaceModuleService from "../../../../modules/marketplace/service"

type CreateSellerStepInput = {
  name: string
  handle?: string
  logo?: string
  description?: string
}

const createSellerStep = createStep(
  "create-seller",
  async (sellerData: CreateSellerStepInput, { container }) => {
    const marketplaceModuleService: MarketplaceModuleService =
      container.resolve(MARKETPLACE_MODULE)

    const seller = await marketplaceModuleService.createSellers(sellerData)

    return new StepResponse(seller, seller.id)
  },
  async (sellerId, { container }) => {
    if (!sellerId) {
      return
    }

    const marketplaceModuleService: MarketplaceModuleService =
      container.resolve(MARKETPLACE_MODULE)

    await marketplaceModuleService.deleteSellers(sellerId)
  }
)

export default createSellerStep

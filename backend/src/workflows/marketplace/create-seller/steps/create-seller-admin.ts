import {
  createStep,
  StepResponse,
} from "@medusajs/framework/workflows-sdk"
import MarketplaceModuleService from "../../../../modules/marketplace/service"
import { MARKETPLACE_MODULE } from "../../../../modules/marketplace"

type CreateSellerAdminStepInput = {
  email?: string
  phone?: string
  first_name?: string
  last_name?: string
  role?: "owner" | "staff"
  auth_identity_id?: string
  seller_id: string
}

const createSellerAdminStep = createStep(
  "create-seller-admin-step",
  async (adminData: CreateSellerAdminStepInput, { container }) => {
    const marketplaceModuleService: MarketplaceModuleService =
      container.resolve(MARKETPLACE_MODULE)

    const sellerAdmin = await marketplaceModuleService.createSellerAdmins(
      adminData
    )

    return new StepResponse(sellerAdmin, sellerAdmin.id)
  },
  async (sellerAdminId, { container }) => {
    if (!sellerAdminId) {
      return
    }

    const marketplaceModuleService: MarketplaceModuleService =
      container.resolve(MARKETPLACE_MODULE)

    await marketplaceModuleService.deleteSellerAdmins(sellerAdminId)
  }
)

export default createSellerAdminStep

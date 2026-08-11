import {
  createStep,
  StepResponse,
} from "@medusajs/framework/workflows-sdk"
import KycModuleService from "../../../../modules/kyc/service"
import { KYC_MODULE } from "../../../../modules/kyc"

type SeedSellerKycStepInput = {
  email?: string
  phone?: string
  sellerAdminId: string
  skip?: boolean
}

// The identifier a seller signs up with (email or phone) IS their verified
// contact — the login credential proves ownership — so it is seeded as
// verified in KYC immediately. KYC then only verifies the complementary
// identifier plus identity details (the signup identifier is never
// re-verified). The profile is anchored to the seller_admin account so the
// user's KYC lives on their profile, not on a loose contact string.
const seedSellerKycStep = createStep(
  "seed-seller-kyc-step",
  async (input: SeedSellerKycStepInput, { container }) => {
    if (input.skip) {
      return new StepResponse(null, null)
    }
    const kyc: KycModuleService = container.resolve(KYC_MODULE)
    const profile = await kyc.getOrCreateProfile({
      email: input.email,
      phone: input.phone,
      userType: "seller",
      userId: input.sellerAdminId,
    })
    await kyc.seedSignupIdentifier({
      email: input.email,
      phone: input.phone,
      userType: "seller",
      userId: input.sellerAdminId,
    })

    return new StepResponse(profile.id, profile.id)
  },
  async (profileId, { container }) => {
    if (!profileId) {
      return
    }
    const kyc: KycModuleService = container.resolve(KYC_MODULE)
    await kyc.deleteKycProfiles(profileId)
  }
)

export default seedSellerKycStep

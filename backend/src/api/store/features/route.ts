import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { PLATFORM_FEATURES_MODULE } from "../../../modules/platform-features"
import PlatformFeatureModuleService from "../../../modules/platform-features/service"

// Public, secret-free feature toggles. The frontend reads this response to
// hide disabled areas, while backend routes enforce the same state separately.
export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
  const features = req.scope.resolve<PlatformFeatureModuleService>(
    PLATFORM_FEATURES_MODULE
  )
  res.json({ features: await features.getPublicFlags() })
}

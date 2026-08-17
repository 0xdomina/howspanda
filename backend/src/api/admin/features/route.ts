import {
  AuthenticatedMedusaRequest,
  MedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { MedusaError } from "@medusajs/framework/utils"
import { PLATFORM_FEATURES_MODULE } from "../../../modules/platform-features"
import PlatformFeatureModuleService from "../../../modules/platform-features/service"

function requireOperationsUser(req: AuthenticatedMedusaRequest): void {
  if (req.auth_context?.actor_type !== "user") {
    throw new MedusaError(
      MedusaError.Types.UNAUTHORIZED,
      "An operations user is required"
    )
  }
}

// Operations view of the allowlisted platform feature switches. This endpoint
// is private; the public storefront receives only boolean feature flags.
export const GET = async (
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) => {
  requireOperationsUser(req)
  const features = req.scope.resolve<PlatformFeatureModuleService>(
    PLATFORM_FEATURES_MODULE
  )
  res.json(await features.getStatus())
}

export const PATCH = async (
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) => {
  requireOperationsUser(req)
  const { key } = req.params as { key: string }
  const { enabled } = req.validatedBody as { enabled: boolean }
  const features = req.scope.resolve<PlatformFeatureModuleService>(
    PLATFORM_FEATURES_MODULE
  )
  res.json(await features.setEnabled(key, enabled))
}

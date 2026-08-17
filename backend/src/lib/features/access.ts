import { MedusaError } from "@medusajs/framework/utils"
import PlatformFeatureModuleService from "../../modules/platform-features/service"
import {
  PLATFORM_FEATURES_MODULE,
} from "../../modules/platform-features"
import type { PlatformFeatureKey } from "./flags"

export async function isPlatformFeatureEnabled(
  scope: any,
  key: PlatformFeatureKey
): Promise<boolean> {
  const features = scope.resolve(
    PLATFORM_FEATURES_MODULE
  ) as PlatformFeatureModuleService
  return features.isEnabled(key)
}

export async function requirePlatformFeature(
  scope: any,
  key: PlatformFeatureKey
): Promise<void> {
  if (!(await isPlatformFeatureEnabled(scope, key))) {
    // Hide disabled features from both normal browsing and direct API probing.
    throw new MedusaError(MedusaError.Types.NOT_FOUND, "Not found")
  }
}

import { Module } from "@medusajs/framework/utils"
import PlatformFeatureModuleService from "./service"

export const PLATFORM_FEATURES_MODULE = "platform_features"

export default Module(PLATFORM_FEATURES_MODULE, {
  service: PlatformFeatureModuleService,
})

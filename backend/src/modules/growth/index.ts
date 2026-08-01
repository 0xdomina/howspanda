import { Module } from "@medusajs/framework/utils"
import GrowthModuleService from "./service"

export const GROWTH_MODULE = "growth"

export default Module(GROWTH_MODULE, {
  service: GrowthModuleService,
})

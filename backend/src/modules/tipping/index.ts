import { Module } from "@medusajs/framework/utils"
import TippingModuleService from "./service"

export const TIPPING_MODULE = "tipping"

export default Module(TIPPING_MODULE, {
  service: TippingModuleService,
})

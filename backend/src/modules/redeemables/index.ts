import { Module } from "@medusajs/framework/utils"
import RedeemablesModuleService from "./service"

export const REDEEMABLES_MODULE = "redeemables"

export default Module(REDEEMABLES_MODULE, {
  service: RedeemablesModuleService,
})

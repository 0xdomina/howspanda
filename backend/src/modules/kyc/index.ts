import { Module } from "@medusajs/framework/utils"
import KycModuleService from "./service"

export const KYC_MODULE = "kyc"

export default Module(KYC_MODULE, {
  service: KycModuleService,
})

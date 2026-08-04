import { Module } from "@medusajs/framework/utils"
import PaymentRailModuleService from "./service"

export const PAYMENT_RAILS_MODULE = "payment_rails"

export default Module(PAYMENT_RAILS_MODULE, {
  service: PaymentRailModuleService,
})

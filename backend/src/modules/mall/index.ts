import { Module } from "@medusajs/framework/utils"
import MallModuleService from "./service"

export const MALL_MODULE = "mall"

export default Module(MALL_MODULE, {
  service: MallModuleService,
})

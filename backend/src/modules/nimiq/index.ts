import { Module } from "@medusajs/framework/utils"
import NimiqQuote from "./models/nimiq-quote"
import NimiqModuleService from "./service"

export const NIMIQ_MODULE = "nimiq"

export default Module(NIMIQ_MODULE, {
  service: NimiqModuleService,
})

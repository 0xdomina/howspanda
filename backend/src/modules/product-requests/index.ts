import { Module } from "@medusajs/framework/utils"
import ProductRequestsModuleService from "./service"

export const PRODUCT_REQUESTS_MODULE = "productRequests"

export default Module(PRODUCT_REQUESTS_MODULE, {
  service: ProductRequestsModuleService,
})

import { ModuleProvider, Modules } from "@medusajs/framework/utils"
import FlutterwaveProviderService from "./service"

export default ModuleProvider(Modules.PAYMENT, {
  services: [FlutterwaveProviderService],
})

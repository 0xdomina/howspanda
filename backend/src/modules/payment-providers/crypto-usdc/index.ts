import { ModuleProvider, Modules } from "@medusajs/framework/utils"
import CryptoUsdcProviderService from "./service"

export default ModuleProvider(Modules.PAYMENT, {
  services: [CryptoUsdcProviderService],
})

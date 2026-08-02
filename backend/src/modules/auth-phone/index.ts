import { ModuleProvider, Modules } from "@medusajs/framework/utils"
import PhoneAuthService from "./service"

const services = [PhoneAuthService]

export default ModuleProvider(Modules.AUTH, {
  services,
})

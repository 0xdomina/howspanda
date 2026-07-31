import { MedusaService } from "@medusajs/framework/utils"
import Redeemable from "./models/redeemable"
import Redemption from "./models/redemption"

class RedeemablesModuleService extends MedusaService({
  Redeemable,
  Redemption,
}) {}

export default RedeemablesModuleService

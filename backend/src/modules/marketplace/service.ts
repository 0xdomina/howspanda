import { MedusaService } from "@medusajs/framework/utils"
import Seller from "./models/seller"
import SellerAdmin from "./models/seller-admin"
import CommissionLine from "./models/commission-line"

class MarketplaceModuleService extends MedusaService({
  Seller,
  SellerAdmin,
  CommissionLine,
}) { }

export default MarketplaceModuleService

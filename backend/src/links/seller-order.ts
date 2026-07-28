import { defineLink } from "@medusajs/framework/utils"
import MarketplaceModule from "../modules/marketplace"
import OrderModule from "@medusajs/medusa/order"

export default defineLink(
  MarketplaceModule.linkable.seller,
  {
    linkable: OrderModule.linkable.order.id,
    isList: true,
  }
)

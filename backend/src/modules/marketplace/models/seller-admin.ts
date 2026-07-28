import { model } from "@medusajs/framework/utils"
import Seller from "./seller"

const SellerAdmin = model.define("seller_admin", {
  id: model.id().primaryKey(),
  first_name: model.text().nullable(),
  last_name: model.text().nullable(),
  email: model.text().unique(),
  seller: model.belongsTo(() => Seller, {
    mappedBy: "admins",
  }),
})

export default SellerAdmin

import { model } from "@medusajs/framework/utils"
import Seller from "./seller"

const SellerAdmin = model.define("seller_admin", {
  id: model.id().primaryKey(),
  first_name: model.text().nullable(),
  last_name: model.text().nullable(),
  // Uniqueness on email is enforced by a partial unique index (migration) so
  // NULL emails (phone-first sellers) are allowed alongside unique emails.
  email: model.text().nullable(),
  // Phone is the login identifier for phone-first sellers. The signup
  // credential itself IS the verified contact, so KYC never re-verifies it.
  phone: model.text().nullable(),
  seller: model.belongsTo(() => Seller, {
    mappedBy: "admins",
  }),
})

export default SellerAdmin

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
  // Store staff vs the store owner. The owner (creator) can manage the store,
  // its team and its money; staff get the day-to-day dashboard (products,
  // orders, delivery, broadcasts) but cannot touch settings, team or payouts.
  role: model.enum(["owner", "staff"]).default("owner"),
  // Links the seller_admin row to its auth identity so the store owner can
  // later remove a staff member (and their login) by id.
  auth_identity_id: model.text().nullable(),
  seller: model.belongsTo(() => Seller, {
    mappedBy: "admins",
  }),
})

export default SellerAdmin

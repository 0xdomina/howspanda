import { model } from "@medusajs/framework/utils"

// A courier is a real role on the platform, not just an email typed into an
// offer. Anyone can APPLY (from a logged-in customer or seller account), but
// the profile only becomes "approved" once the applicant's phone number is
// KYC-verified — the minimum level to earn delivery payouts. Offers and
// pickups derive the courier's email from the authenticated actor, so an
// anonymous visitor can never act as a courier.
const DeliveryCourier = model.define("delivery_courier", {
  id: model.id().primaryKey(),
  // Courier identity (email-based, like the delivery parties / buyer wallet).
  // Unique — one profile per courier.
  courier_email: model.text(),
  // Links the profile to the account that applied (customer or seller auth
  // identity) so the email can never be claimed for a different account.
  auth_identity_id: model.text().nullable(),
  actor_type: model.enum(["customer", "seller"]).nullable(),
  name: model.text().nullable(),
  phone: model.text().nullable(),
  city: model.text().nullable(),
  vehicle: model.text().nullable(),
  status: model.enum(["applied", "approved", "suspended"]).default("applied"),
  approved_at: model.dateTime().nullable(),
})

export default DeliveryCourier

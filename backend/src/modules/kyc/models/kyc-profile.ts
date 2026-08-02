import { model } from "@medusajs/framework/utils"

// Progressive KYC ladder. Keyed by email when the seller signs up with an
// email, and by phone when they sign up with a phone. The ladder is:
//   unverified -> phone_verified -> identity_verified.
// The signup identifier IS the verified contact (the login credential proves
// ownership), so KYC never re-verifies it — it only covers the complementary
// identifier (email or phone) plus identity details.
// Nothing here stores full ID numbers -- only the last 4 chars ("tail").
const KycProfile = model.define("kyc_profile", {
  id: model.id().primaryKey(),
  // Uniqueness on email is enforced by a partial unique index (migration) so
  // NULL emails (phone-first sellers) are allowed alongside unique emails.
  email: model.text().nullable(),
  phone: model.text().nullable(),
  email_verified_at: model.dateTime().nullable(),
  phone_verified_at: model.dateTime().nullable(),
  id_type: model.text().nullable(),
  id_tail: model.text().nullable(),
  id_status: model
    .enum(["none", "pending", "verified", "rejected"])
    .default("none"),
  id_submitted_at: model.dateTime().nullable(),
  id_reviewed_at: model.dateTime().nullable(),
})

export default KycProfile

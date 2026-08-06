import { model } from "@medusajs/framework/utils"

// Progressive KYC ladder — platform-wide, anchored to the USER who owns it.
// Every kyc_profile belongs to one account (customer or seller_admin) via
// (user_type, user_id) — one profile per user. Email/phone stay on the row as
// the verified contact and OTP key. The ladder is:
//   unverified -> phone_verified -> identity_verified.
// The signup identifier IS the verified contact (the login credential proves
// ownership), so KYC never re-verifies it — it only covers the complementary
// identifier (email or phone) plus identity details.
// Nothing here stores full ID numbers -- only the last 4 chars ("tail").
const KycProfile = model.define("kyc_profile", {
  id: model.id().primaryKey(),
  // The account that owns this KYC state (customer or seller). One profile per
  // (user_type, user_id) — enforced by a partial unique index (migration) so
  // legacy/unlinked rows are still allowed.
  user_type: model.text().nullable(),
  user_id: model.text().nullable(),
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

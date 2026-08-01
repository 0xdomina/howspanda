import { model } from "@medusajs/framework/utils"

// Progressive KYC ladder, keyed by email (covers both seller admins and
// couriers — both are email identities in this system). The ladder is:
//   unverified -> phone_verified -> identity_verified.
// Nothing here stores full ID numbers — only the last 4 chars ("tail").
const KycProfile = model.define("kyc_profile", {
  id: model.id().primaryKey(),
  email: model.text().unique().searchable(),
  phone: model.text().nullable(),
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

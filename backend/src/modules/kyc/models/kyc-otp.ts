import { model } from "@medusajs/framework/utils"

// A one-time verification code request (email or phone). Only a hash is
// stored, mirroring the delivery-module OTP pattern. The actual delivery
// (email/SMS/WhatsApp) is handled by the send seam and is OFF by default.
const KycOtp = model.define("kyc_otp", {
  id: model.id().primaryKey(),
  email: model.text().searchable(),
  channel: model.enum(["email", "phone"]),
  destination: model.text().searchable(),
  code_hash: model.text(),
  code_tail: model.text(),
  status: model.enum(["active", "used", "expired"]).default("active"),
  expires_at: model.dateTime(),
  used_at: model.dateTime().nullable(),
})

export default KycOtp

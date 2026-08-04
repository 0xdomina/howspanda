import { model } from "@medusajs/framework/utils"

// A one-time verification code for the credential flows (signup OTP and
// forgot-password reset). Only a hash is stored, mirroring the KYC OTP
// pattern; the send seam decides whether anything leaves the box.
const AuthOtp = model.define("auth_otp", {
  id: model.id().primaryKey(),
  email: model.text().searchable(),
  purpose: model.enum(["signup", "reset"]),
  channel: model.enum(["email", "phone"]).default("email"),
  destination: model.text().searchable(),
  code_hash: model.text(),
  code_tail: model.text(),
  status: model.enum(["active", "used", "expired"]).default("active"),
  expires_at: model.dateTime(),
  used_at: model.dateTime().nullable(),
})

export default AuthOtp

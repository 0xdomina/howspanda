import { createHash, randomInt } from "node:crypto"
import { MedusaError, MedusaService } from "@medusajs/framework/utils"
import KycProfile from "./models/kyc-profile"
import KycOtp from "./models/kyc-otp"
import { sendOtp } from "../../lib/kyc/send-otp"

const CODE_LIFETIME_MS = 15 * 60 * 1000

export type KycLevel = "unverified" | "phone_verified" | "identity_verified"

export type KycProfileView = {
  email: string
  phone: string | null
  level: KycLevel
  phone_verified: boolean
  id_type: string | null
  id_tail: string | null
  id_status: string
  phone_verified_at: string | null
  id_submitted_at: string | null
  id_reviewed_at: string | null
}

export function computeLevel(profile: {
  id_status: string
  phone_verified_at: Date | null
}): KycLevel {
  if (profile.id_status === "verified") {
    return "identity_verified"
  }
  if (profile.phone_verified_at) {
    return "phone_verified"
  }
  return "unverified"
}

// Default identity threshold: NIN is an 11-digit number. Reject anything that
// doesn't match so garbage submissions never enter the ladder.
const NIN_RE = /^\d{11}$/

class KycModuleService extends MedusaService({ KycProfile, KycOtp }) {
  /**
   * Whether verification delivery (email/SMS/WhatsApp) is actually enabled.
   * OFF by default — the seam is wired but no real message fires until
   * KYC_VERIFICATION_ENABLED=true post-launch.
   */
  verificationEnabled(): boolean {
    return process.env.KYC_VERIFICATION_ENABLED === "true"
  }

  /**
   * Whether couriers must be phone-verified to make an offer. OFF by default
   * so existing delivery flows are untouched until the gate is flipped on.
   */
  courierGateEnabled(): boolean {
    return process.env.KYC_COURIER_GATE_ENABLED === "true"
  }

  async getOrCreateProfile(email: string) {
    const normalized = email.trim().toLowerCase()
    const existing = await this.listKycProfiles(
      { email: normalized },
      { take: 1 }
    )
    if (existing[0]) {
      return existing[0]
    }
    const created = await this.createKycProfiles({ email: normalized })
    return created
  }

  async getProfileView(email: string): Promise<KycProfileView | null> {
    const normalized = email.trim().toLowerCase()
    const [profile] = await this.listKycProfiles(
      { email: normalized },
      { take: 1 }
    )
    if (!profile) {
      return null
    }
    return {
      email: profile.email,
      phone: profile.phone,
      level: computeLevel(profile),
      phone_verified: !!profile.phone_verified_at,
      id_type: profile.id_type,
      id_tail: profile.id_tail,
      id_status: profile.id_status,
      phone_verified_at: profile.phone_verified_at
        ? profile.phone_verified_at.toISOString()
        : null,
      id_submitted_at: profile.id_submitted_at
        ? profile.id_submitted_at.toISOString()
        : null,
      id_reviewed_at: profile.id_reviewed_at
        ? profile.id_reviewed_at.toISOString()
        : null,
    }
  }

  /**
   * Request an OTP for email or phone. The code is always generated and stored
   * (hash only); the send seam decides whether anything actually leaves the
   * box. Returns the raw code ONLY in mock/dev mode so tests can assert on it.
   */
  async requestOtp(input: {
    email: string
    channel: "email" | "phone"
    destination: string
  }): Promise<{ code: string | null }> {
    const normalized = input.email.trim().toLowerCase()
    const code = String(randomInt(0, 1000000)).padStart(6, "0")

    const profile = await this.getOrCreateProfile(normalized)
    await this.createKycOtps({
      email: normalized,
      channel: input.channel,
      destination: input.destination.trim(),
      code_hash: createHash("sha256").update(code).digest("hex"),
      code_tail: code.slice(-4),
      status: "active",
      expires_at: new Date(Date.now() + CODE_LIFETIME_MS),
    })

    // The send seam is a no-op unless verification is enabled. This is the
    // single place a future SMS/email/WhatsApp provider plugs in.
    const deliveredCode = await sendOtp({
      channel: input.channel,
      destination: input.destination,
      code,
    })

    if (input.channel === "phone") {
      await this.updateKycProfiles({
        id: profile.id,
        phone: input.destination.trim(),
      })
    }

    return { code: deliveredCode }
  }

  /**
   * Verify a presented code. Success bumps the ladder (phone_verified);
   * failures are rejected with a clear message. Codes are single-use.
   */
  async verifyOtp(input: {
    email: string
    channel: "email" | "phone"
    destination: string
    code: string
  }): Promise<{ ok: boolean; profile: KycProfileView }> {
    const normalized = input.email.trim().toLowerCase()

    const [otp] = await this.listKycOtps(
      {
        email: normalized,
        channel: input.channel,
        destination: input.destination.trim(),
        status: "active",
      },
      { order: { created_at: "DESC" }, take: 1 }
    )

    if (!otp) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "No active verification code found for this destination"
      )
    }
    if (Date.now() > new Date(otp.expires_at).getTime()) {
      throw new MedusaError(MedusaError.Types.INVALID_DATA, "Code has expired")
    }
    if (createHash("sha256").update(input.code).digest("hex") !== otp.code_hash) {
      throw new MedusaError(MedusaError.Types.INVALID_DATA, "Incorrect code")
    }

    await this.updateKycOtps({
      id: otp.id,
      status: "used",
      used_at: new Date(),
    })

    const profile = await this.getOrCreateProfile(normalized)
    if (input.channel === "phone") {
      await this.updateKycProfiles({
        id: profile.id,
        phone: input.destination.trim(),
        phone_verified_at: new Date(),
      })
    }

    return { ok: true, profile: (await this.getProfileView(normalized))! }
  }

  /**
   * Submit an identity document (NIN for now). Only the last 4 digits are
   * stored. Valid-format submissions enter the ladder as "pending"; an admin
   * review (or a provider match) flips them to verified later.
   */
  async submitIdentity(input: {
    email: string
    id_type: string
    id_number: string
  }): Promise<{ ok: boolean; profile: KycProfileView }> {
    const normalized = input.email.trim().toLowerCase()
    if (input.id_type !== "nin") {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        'Only id_type "nin" is supported for now'
      )
    }
    if (!NIN_RE.test(input.id_number.trim())) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "NIN must be an 11-digit number"
      )
    }

    const profile = await this.getOrCreateProfile(normalized)
    await this.updateKycProfiles({
      id: profile.id,
      id_type: "nin",
      id_tail: input.id_number.trim().slice(-4),
      id_status: "pending",
      id_submitted_at: new Date(),
    })

    return { ok: true, profile: (await this.getProfileView(normalized))! }
  }

  /**
   * Admin/edge step: manually confirm or reject an identity submission. This
   * is where a future NIN provider match would also land.
   */
  async reviewIdentity(input: {
    email: string
    decision: "verified" | "rejected"
  }): Promise<{ ok: boolean; profile: KycProfileView }> {
    const normalized = input.email.trim().toLowerCase()
    const profile = await this.getOrCreateProfile(normalized)
    if (profile.id_status === "none") {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "No identity submission to review"
      )
    }
    await this.updateKycProfiles({
      id: profile.id,
      id_status: input.decision,
      id_reviewed_at: new Date(),
    })
    return { ok: true, profile: (await this.getProfileView(normalized))! }
  }

  /**
   * Gate check used by the courier offer route. Throws a friendly error when
   * the gate is enabled and the courier is not at least phone-verified.
   */
  async assertCourierKyc(email: string): Promise<void> {
    const profile = await this.getProfileView(email)
    if (!profile || !profile.phone_verified) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "Verify your phone number before making a delivery offer",
        "kyc_required"
      )
    }
  }
}

export default KycModuleService

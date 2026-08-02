import { createHash, randomInt } from "node:crypto"
import { MedusaError, MedusaService } from "@medusajs/framework/utils"
import KycProfile from "./models/kyc-profile"
import KycOtp from "./models/kyc-otp"
import { sendOtp } from "../../lib/kyc/send-otp"

const CODE_LIFETIME_MS = 15 * 60 * 1000

export type KycLevel = "unverified" | "phone_verified" | "identity_verified"

export type KycProfileView = {
  email: string | null
  phone: string | null
  level: KycLevel
  email_verified: boolean
  phone_verified: boolean
  id_type: string | null
  id_tail: string | null
  id_status: string
  email_verified_at: string | null
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

  /**
   * Find or create a KYC profile by email and/or phone. The profile is keyed
   * by whichever identifier the seller signed up with; the other identifier is
   * filled in later when it is verified during KYC.
   */
  async getOrCreateProfile(input: {
    email?: string | null
    phone?: string | null
  }) {
    const email = input.email?.trim().toLowerCase() || null
    const phone = input.phone?.trim() || null

    let existing: {
      id: string
      email: string | null
      phone: string | null
      email_verified_at: Date | null
      phone_verified_at: Date | null
      id_status: string
    } | null = null
    if (email) {
      const byEmail = await this.listKycProfiles({ email }, { take: 1 })
      existing = byEmail[0] ?? null
    }
    if (!existing && phone) {
      const byPhone = await this.listKycProfiles({ phone }, { take: 1 })
      existing = byPhone[0] ?? null
    }
    if (existing) {
      // Merge a newly-provided complementary identifier onto the profile.
      if (email && !existing.email && email !== existing.email) {
        return this.updateKycProfiles({ id: existing.id, email })
      }
      if (phone && !existing.phone && phone !== existing.phone) {
        return this.updateKycProfiles({ id: existing.id, phone })
      }
      return existing
    }
    return this.createKycProfiles({
      email,
      phone,
    })
  }

  async getProfileView(input: {
    email?: string | null
    phone?: string | null
  }): Promise<KycProfileView | null> {
    const email = input.email?.trim().toLowerCase() || null
    const phone = input.phone?.trim() || null

    let profile: {
      email: string | null
      phone: string | null
      email_verified_at: Date | null
      phone_verified_at: Date | null
      id_type: string | null
      id_tail: string | null
      id_status: string
      id_submitted_at: Date | null
      id_reviewed_at: Date | null
    } | null = null
    if (email) {
      const byEmail = await this.listKycProfiles({ email }, { take: 1 })
      profile = byEmail[0] ?? null
    }
    if (!profile && phone) {
      const byPhone = await this.listKycProfiles({ phone }, { take: 1 })
      profile = byPhone[0] ?? null
    }
    if (!profile) {
      return null
    }
    return {
      email: profile.email,
      phone: profile.phone,
      level: computeLevel(profile),
      email_verified: !!profile.email_verified_at,
      phone_verified: !!profile.phone_verified_at,
      id_type: profile.id_type,
      id_tail: profile.id_tail,
      id_status: profile.id_status,
      email_verified_at: profile.email_verified_at
        ? profile.email_verified_at.toISOString()
        : null,
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
    email?: string | null
    phone?: string | null
    channel: "email" | "phone"
    destination: string
  }): Promise<{ code: string | null }> {
    const code = String(randomInt(0, 1000000)).padStart(6, "0")

    const profile = await this.getOrCreateProfile({
      email: input.email,
      phone: input.phone,
    })
    // OTPs are keyed by the profile's primary email (the seller's KYC key),
    // but a phone-first seller has no email yet — key by phone then.
    const otpKey = profile.email ?? profile.phone ?? ""

    await this.createKycOtps({
      email: otpKey,
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

    return { code: deliveredCode }
  }

  /**
   * Verify a presented code. Success bumps the ladder for the verified
   * identifier (email_verified / phone_verified). The signup identifier is
   * never re-verified here — KYC only covers the complementary identifier.
   * Codes are single-use.
   */
  async verifyOtp(input: {
    email?: string | null
    phone?: string | null
    channel: "email" | "phone"
    destination: string
    code: string
  }): Promise<{ ok: boolean; profile: KycProfileView }> {
    const profile = await this.getOrCreateProfile({
      email: input.email,
      phone: input.phone,
    })
    const otpKey = profile.email ?? profile.phone ?? ""

    const [otp] = await this.listKycOtps(
      {
        email: otpKey,
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

    if (input.channel === "phone") {
      await this.updateKycProfiles({
        id: profile.id,
        phone: input.destination.trim(),
        phone_verified_at: new Date(),
      })
    } else if (input.channel === "email") {
      await this.updateKycProfiles({
        id: profile.id,
        email: input.destination.trim().toLowerCase(),
        email_verified_at: new Date(),
      })
    }

    return {
      ok: true,
      profile: (await this.getProfileView({
        email: profile.email,
        phone: profile.phone,
      }))!,
    }
  }

  /**
   * Submit an identity document (NIN for now). Only the last 4 digits are
   * stored. Valid-format submissions enter the ladder as "pending"; an admin
   * review (or a provider match) flips them to verified later.
   */
  async submitIdentity(input: {
    email?: string | null
    phone?: string | null
    id_type: string
    id_number: string
  }): Promise<{ ok: boolean; profile: KycProfileView }> {
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

    const profile = await this.getOrCreateProfile({
      email: input.email,
      phone: input.phone,
    })
    await this.updateKycProfiles({
      id: profile.id,
      id_type: "nin",
      id_tail: input.id_number.trim().slice(-4),
      id_status: "pending",
      id_submitted_at: new Date(),
    })

    return {
      ok: true,
      profile: (await this.getProfileView({
        email: profile.email,
        phone: profile.phone,
      }))!,
    }
  }

  /**
   * Admin/edge step: manually confirm or reject an identity submission. This
   * is where a future NIN provider match would also land.
   */
  async reviewIdentity(input: {
    email?: string | null
    phone?: string | null
    decision: "verified" | "rejected"
  }): Promise<{ ok: boolean; profile: KycProfileView }> {
    const profile = await this.getOrCreateProfile({
      email: input.email,
      phone: input.phone,
    })
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
    return {
      ok: true,
      profile: (await this.getProfileView({
        email: profile.email,
        phone: profile.phone,
      }))!,
    }
  }

  /**
   * Gate check used by the courier offer route. Throws a friendly error when
   * the gate is enabled and the courier is not at least phone-verified.
   */
  async assertCourierKyc(email: string): Promise<void> {
    const profile = await this.getProfileView({ email })
    if (!profile || !profile.phone_verified) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "Verify your phone number before making a delivery offer",
        "kyc_required"
      )
    }
  }

  /**
   * Called when a seller account is created. The identifier they signed up
   * with (email or phone) is already verified — the login credential proves
   * ownership — so it is marked verified immediately and KYC never asks for
   * it again. The complementary identifier is left unverified for KYC.
   */
  async seedSignupIdentifier(input: {
    email?: string | null
    phone?: string | null
  }): Promise<KycProfileView> {
    const profile = await this.getOrCreateProfile({
      email: input.email,
      phone: input.phone,
    })
    if (input.phone) {
      await this.updateKycProfiles({
        id: profile.id,
        phone: input.phone.trim(),
        phone_verified_at: profile.phone_verified_at ?? new Date(),
      })
    } else if (input.email) {
      await this.updateKycProfiles({
        id: profile.id,
        email: input.email.trim().toLowerCase(),
        email_verified_at: profile.email_verified_at ?? new Date(),
      })
    }
    return (await this.getProfileView({
      email: profile.email ?? input.email,
      phone: profile.phone ?? input.phone,
    }))!
  }
}

export default KycModuleService

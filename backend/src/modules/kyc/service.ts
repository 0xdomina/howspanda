import { createHash, randomInt } from "node:crypto"
import { MedusaError, MedusaService } from "@medusajs/framework/utils"
import KycProfile from "./models/kyc-profile"
import KycOtp from "./models/kyc-otp"
import { sendOtp } from "../../lib/kyc/send-otp"
import { matchNin, type ExtractedNinDoc } from "../../lib/kyc/nin-match"

const CODE_LIFETIME_MS = 15 * 60 * 1000

export type KycLevel =
  | "unverified"
  | "phone_verified"
  | "profile_completed"
  | "identity_verified"

// The account that owns a KYC profile: a customer or seller_admin id. KYC is
// platform-wide state that lives on the user profile — email/phone remain the
// verified contact, but the row is anchored to (user_type, user_id).
export type KycUserRef = {
  userType?: "customer" | "seller" | null
  userId?: string | null
}

export type KycProfileView = {
  email: string | null
  phone: string | null
  level: KycLevel
  email_verified: boolean
  phone_verified: boolean
  first_name: string | null
  last_name: string | null
  other_name: string | null
  address: string | null
  country: string | null
  state: string | null
  city: string | null
  postal_code: string | null
  id_type: string | null
  id_tail: string | null
  id_status: string
  email_verified_at: string | null
  phone_verified_at: string | null
  id_submitted_at: string | null
  id_reviewed_at: string | null
  id_document_uploaded: boolean
  id_document_mime: string | null
}

// Which personal fields must be present (and non-empty) for the ladder to count
// the profile as complete. Postal code is optional — not everyone knows theirs
// (the UI suggests it from the address but the user can skip it).
export const PROFILE_REQUIRED_FIELDS = [
  "first_name",
  "last_name",
  "address",
  "country",
  "state",
  "city",
] as const

export function profileComplete(profile: {
  first_name?: string | null
  last_name?: string | null
  address?: string | null
  country?: string | null
  state?: string | null
  city?: string | null
}): boolean {
  return PROFILE_REQUIRED_FIELDS.every((f) => !!profile[f]?.trim())
}

export function computeLevel(profile: {
  id_status: string
  phone_verified_at: Date | null
  first_name?: string | null
  last_name?: string | null
  address?: string | null
  country?: string | null
  state?: string | null
  city?: string | null
}): KycLevel {
  if (profile.id_status === "verified") {
    return "identity_verified"
  }
  if (profile.phone_verified_at) {
    if (profileComplete(profile)) {
      return "profile_completed"
    }
    return "phone_verified"
  }
  return "unverified"
}

// Numeric ordering of the ladder for gate comparisons.
export const KYC_LEVEL_ORDER: Record<KycLevel, number> = {
  unverified: 0,
  phone_verified: 1,
  profile_completed: 2,
  identity_verified: 3,
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
   * Whether NIN document verification is switched on (FEATURE_NIN_VERIFICATION).
   * Off by default — phone + complete profile unlocks selling + couriering. When
   * on, identity verification becomes a mandatory rung of the same ladder.
   */
  ninVerificationEnabled(): boolean {
    return process.env.FEATURE_NIN_VERIFICATION !== "false"
  }

  /**
   * The ladder level a user must reach to unlock selling + couriering. With NIN
   * verification off (default) it's profile_completed; flipping the NIN feature
   * on raises the bar to identity_verified automatically.
   */
  requiredUnlockLevel(): KycLevel {
    return "profile_completed"
  }

  requiredCourierLevel(): KycLevel {
    return "identity_verified"
  }

  private unlockMessage(required: KycLevel): string {
    if (required === "identity_verified") {
      return "Upload and verify your ID card to unlock courier features."
    }
      return "Complete your KYC profile (verified phone + personal details) to set up your store."
  }

  /**
   * Find or create a KYC profile by user and/or email/phone. When the owning
   * user is known (authenticated actor) the profile is keyed by
   * (user_type, user_id) — one profile per user. Email/phone still identify
   * the row for pre-account flows and stay as the verified contact.
   */
  async getOrCreateProfile(input: {
    email?: string | null
    phone?: string | null
    userType?: "customer" | "seller" | null
    userId?: string | null
  }) {
    const email = input.email?.trim().toLowerCase() || null
    const phone = input.phone?.trim() || null

    let existing: {
      id: string
      user_type: string | null
      user_id: string | null
      email: string | null
      phone: string | null
      email_verified_at: Date | null
      phone_verified_at: Date | null
      first_name: string | null
      last_name: string | null
      other_name: string | null
      id_status: string
    } | null = null

    if (input.userType && input.userId) {
      const byUser = await this.listKycProfiles(
        { user_type: input.userType, user_id: input.userId },
        { take: 1 }
      )
      existing = byUser[0] ?? null
    }
    if (!existing && email) {
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
      // Anchor an unlinked profile to its owner when the user is now known.
      if (
        input.userType &&
        input.userId &&
        (existing.user_type !== input.userType ||
          existing.user_id !== input.userId)
      ) {
        return this.updateKycProfiles({
          id: existing.id,
          user_type: input.userType,
          user_id: input.userId,
        })
      }
      return existing
    }
    return this.createKycProfiles({
      email,
      phone,
      user_type: input.userType ?? null,
      user_id: input.userId ?? null,
    })
  }

  /**
   * The owning user for an authenticated actor, resolved from the auth context
   * (customer or seller). Returns null when the actor isn't KYC-relevant.
   */
  private userRefFor(
    auth?: { actor_type?: string | null; actor_id?: string | null } | null
  ): KycUserRef {
    if (
      auth?.actor_id &&
      (auth.actor_type === "customer" || auth.actor_type === "seller")
    ) {
      return { userType: auth.actor_type, userId: auth.actor_id }
    }
    return { userType: null, userId: null }
  }

  /**
   * Resolve the authenticated actor's KYC state (customer or seller). This is
   * the "KYC on the user profile" accessor — every user's KYC is a single row
   * anchored to their account. `email` is an optional fallback contact for
   * profiles created through public email-keyed flows before linking.
   */
  async getProfileForUser(
    auth: {
      actor_type?: string | null
      actor_id?: string | null
    },
    email?: string | null
  ): Promise<KycProfileView | null> {
    const ref = this.userRefFor(auth)
    if (!ref.userType || !ref.userId) {
      return null
    }
    return this.getProfileView({
      userType: ref.userType,
      userId: ref.userId,
      email: email ?? null,
    })
  }

  async getProfileView(input: {
    email?: string | null
    phone?: string | null
    userType?: "customer" | "seller" | null
    userId?: string | null
  }): Promise<KycProfileView | null> {
    const email = input.email?.trim().toLowerCase() || null
    const phone = input.phone?.trim() || null

    let profile: {
      id: string
      user_type: string | null
      user_id: string | null
      email: string | null
      phone: string | null
      email_verified_at: Date | null
      phone_verified_at: Date | null
      first_name: string | null
      last_name: string | null
      other_name: string | null
      address: string | null
      country: string | null
      state: string | null
      city: string | null
      postal_code: string | null
      id_type: string | null
      id_tail: string | null
      id_status: string
      id_submitted_at: Date | null
      id_reviewed_at: Date | null
      id_document_hash: string | null
      id_document_mime: string | null
      id_document_size: number | null
    } | null = null
    if (input.userType && input.userId) {
      const byUser = await this.listKycProfiles(
        { user_type: input.userType, user_id: input.userId },
        { take: 1 }
      )
      profile = byUser[0] ?? null
    }
    if (!profile && email) {
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
    // Anchor an unlinked profile to its owner when the user is known now
    // (e.g. the profile was created through a public email-keyed flow first).
    if (
      input.userType &&
      input.userId &&
      (profile.user_type !== input.userType ||
        profile.user_id !== input.userId)
    ) {
      const linked = await this.updateKycProfiles({
        id: profile.id,
        user_type: input.userType,
        user_id: input.userId,
      })
      profile = linked as typeof profile
    }
    return {
      email: profile.email,
      phone: profile.phone,
      level: computeLevel(profile),
      email_verified: !!profile.email_verified_at,
      phone_verified: !!profile.phone_verified_at,
      first_name: profile.first_name,
      last_name: profile.last_name,
      other_name: profile.other_name,
      address: profile.address,
      country: profile.country,
      state: profile.state,
      city: profile.city,
      postal_code: profile.postal_code,
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
      id_document_uploaded: !!profile.id_document_hash,
      id_document_mime: profile.id_document_mime,
    }
  }

  /**
   * Save the personal profile portion of the ladder: the names exactly as they
   * appear on the ID card, plus the residence address. When the required fields
   * are filled and the phone is verified, the ladder reaches profile_completed
   * — the level that unlocks seller + courier features.
   */
  async saveProfile(input: {
    email?: string | null
    phone?: string | null
    userType?: "customer" | "seller" | null
    userId?: string | null
    first_name?: string | null
    last_name?: string | null
    other_name?: string | null
    address?: string | null
    country?: string | null
    state?: string | null
    city?: string | null
    postal_code?: string | null
  }): Promise<KycProfileView> {
    const profile = await this.getOrCreateProfile({
      email: input.email,
      phone: input.phone,
      userType: input.userType,
      userId: input.userId,
    })
    await this.updateKycProfiles({
      id: profile.id,
      first_name: input.first_name?.trim() || null,
      last_name: input.last_name?.trim() || null,
      other_name: input.other_name?.trim() || null,
      address: input.address?.trim() || null,
      country: input.country?.trim() || null,
      state: input.state?.trim() || null,
      city: input.city?.trim() || null,
      postal_code: input.postal_code?.trim() || null,
    })
    return (await this.getProfileView({
      userType: input.userType,
      userId: input.userId,
      email: input.email,
      phone: input.phone,
    }))!
  }

  /**
   * Gate a feature (selling, couriering) on a minimum ladder level. Resolves the
   * actor's profile by user anchor or email/phone and throws a friendly error
   * when the level isn't reached yet.
   */
  async assertLevel(input: {
    email?: string | null
    phone?: string | null
    userType?: "customer" | "seller" | null
    userId?: string | null
    required: KycLevel
  }): Promise<KycProfileView> {
    const view = await this.getProfileView({
      email: input.email,
      phone: input.phone,
      userType: input.userType,
      userId: input.userId,
    })
    if (!view || KYC_LEVEL_ORDER[view.level] < KYC_LEVEL_ORDER[input.required]) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        this.unlockMessage(input.required),
        "kyc_required"
      )
    }
    return view
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
    userType?: "customer" | "seller" | null
    userId?: string | null
    id_type: string
    id_number: string
    // Fields extracted client-side from the ID card (OCR + cleaning). Sent as
    // JSON so the backend match has something to check the user's claims
    // against; nothing but the masked number and document fingerprint are
    // persisted.
    extracted?: ExtractedNinDoc
    document?: {
      sha256: string
      mime: string
      size: number
    }
  }): Promise<{ ok: boolean; profile: KycProfileView }> {
    if (input.id_type !== "nin") {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        'Only id_type "nin" is supported for now'
      )
    }
    const nin = input.id_number.trim()
    if (!NIN_RE.test(nin)) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "NIN must be an 11-digit number"
      )
    }

    const profile = await this.getOrCreateProfile({
      email: input.email,
      phone: input.phone,
      userType: input.userType,
      userId: input.userId,
    })

    // With NIN verification flipped on, the submission is verified here and
    // now by the match — there is no admin review on the platform. Off (the
    // default) keeps the pending state until a review/provider flips it.
    let idStatus: "pending" | "verified" = "pending"
    if (this.ninVerificationEnabled() && input.document) {
      const match = matchNin({
        profile: {
          first_name: profile.first_name,
          last_name: profile.last_name,
          other_name: profile.other_name,
        },
        doc: { ...(input.extracted ?? {}), id_number: nin },
      })
      if (!match.verified) {
        throw new MedusaError(
          MedusaError.Types.INVALID_DATA,
          match.reason ?? "NIN could not be verified",
          "nin_match_failed"
        )
      }
      idStatus = "verified"
    }

    const documentFields = input.document
      ? {
          id_document_hash: input.document.sha256,
          id_document_mime: input.document.mime,
          id_document_size: input.document.size,
        }
      : {}

    await this.updateKycProfiles({
      id: profile.id,
      id_type: "nin",
      id_tail: nin.slice(-4),
      id_status: idStatus,
      id_submitted_at: new Date(),
      id_reviewed_at: idStatus === "verified" ? new Date() : null,
      ...documentFields,
    })

    return {
      ok: true,
      profile: (await this.getProfileView({
        userType: input.userType,
        userId: input.userId,
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
   * Gate check used by the courier offer route. Couriering is a real role and
   * is unlocked by the KYC ladder itself: the route enforces the current unlock
   * level (profile_completed today, identity_verified once NIN is flipped on).
   */
  async assertCourierKyc(email: string): Promise<void> {
    const profile = await this.getProfileView({ email })
    const required = this.requiredCourierLevel()
    if (!profile || KYC_LEVEL_ORDER[profile.level] < KYC_LEVEL_ORDER[required]) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        this.unlockMessage(required),
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
    userType?: "customer" | "seller" | null
    userId?: string | null
  }): Promise<KycProfileView> {
    const profile = await this.getOrCreateProfile({
      email: input.email,
      phone: input.phone,
      userType: input.userType,
      userId: input.userId,
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
      userType: input.userType,
      userId: input.userId,
    }))!
  }
}

export default KycModuleService

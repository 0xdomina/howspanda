import { createHash, randomInt } from "node:crypto"
import { MedusaError, MedusaService } from "@medusajs/framework/utils"
import AuthOtp from "./models/auth-otp"
import { sendOtp } from "../../lib/kyc/send-otp"

const CODE_LIFETIME_MS = 15 * 60 * 1000

export const OTP_PURPOSES = ["signup", "reset"] as const
export type OtpPurpose = (typeof OTP_PURPOSES)[number]

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}

class AuthOtpModuleService extends MedusaService({ AuthOtp }) {
  /**
   * Whether verification delivery is actually enabled. Reuses the repo's
   * single verification toggle and send seam (lib/kyc/send-otp.ts) so both
   * KYC and credential OTPs go live together once the SMTP key is configured.
   */
  verificationEnabled(): boolean {
    return process.env.KYC_VERIFICATION_ENABLED === "true"
  }

  /**
   * Request an OTP for a credential flow. The code is always generated and
   * stored (hash only); the send seam decides whether anything actually
   * leaves the box. Returns the raw code ONLY in mock/dev mode so tests and
   * local flows can assert on it.
   */
  async requestOtp(input: {
    email: string
    purpose: OtpPurpose
  }): Promise<{ code: string | null }> {
    const email = normalizeEmail(input.email)
    const code = String(randomInt(0, 1000000)).padStart(6, "0")

    await this.createAuthOtps({
      email,
      purpose: input.purpose,
      channel: "email",
      destination: email,
      code_hash: createHash("sha256").update(code).digest("hex"),
      code_tail: code.slice(-4),
      status: "active",
      expires_at: new Date(Date.now() + CODE_LIFETIME_MS),
    })

    const deliveredCode = await sendOtp({
      channel: "email",
      destination: email,
      code,
    })

    return { code: deliveredCode }
  }

  /**
   * Verify a presented code for a credential flow. Codes are single-use.
   *
   * Pre-launch (no provider configured): ANY non-empty code verifies, so the
   * signup and reset flows work end-to-end without real email delivery. Once
   * verification is enabled and SMTP keys are set, the stored hash is enforced.
   */
  async verifyOtp(input: {
    email: string
    purpose: OtpPurpose
    code: string
  }): Promise<{ ok: boolean }> {
    const email = normalizeEmail(input.email)
    const code = input.code.trim()

    if (!this.verificationEnabled()) {
      if (!code) {
        throw new MedusaError(
          MedusaError.Types.INVALID_DATA,
          "Enter the verification code"
        )
      }
      return { ok: true }
    }

    const [otp] = await this.listAuthOtps(
      {
        email,
        purpose: input.purpose,
        status: "active",
      },
      { order: { created_at: "DESC" }, take: 1 }
    )

    if (!otp) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "No active verification code found for this email"
      )
    }
    if (Date.now() > new Date(otp.expires_at).getTime()) {
      throw new MedusaError(MedusaError.Types.INVALID_DATA, "Code has expired")
    }
    if (createHash("sha256").update(code).digest("hex") !== otp.code_hash) {
      throw new MedusaError(MedusaError.Types.INVALID_DATA, "Incorrect code")
    }

    await this.updateAuthOtps({
      id: otp.id,
      status: "used",
      used_at: new Date(),
    })

    return { ok: true }
  }
}

export default AuthOtpModuleService

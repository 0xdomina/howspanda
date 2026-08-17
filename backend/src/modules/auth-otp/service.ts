import { createHash, randomInt } from "node:crypto"
import { MedusaError, MedusaService } from "@medusajs/framework/utils"
import AuthOtp from "./models/auth-otp"
import { sendOtp } from "../../lib/kyc/send-otp"

const CODE_LIFETIME_MS = 15 * 60 * 1000

export const OTP_PURPOSES = ["signup", "reset", "email_change"] as const
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
   * leaves the box. The raw code is returned to the caller ONLY outside
   * production (dev/staging echo so local flows can complete offline). In
   * production the response never carries the code — it reaches the user only
   * through the delivery channel.
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

    const echoCode =
      process.env.NODE_ENV !== "production" ? code : deliveredCode

    return { code: process.env.NODE_ENV === "production" ? null : echoCode }
  }

  /**
   * Verify a presented code for a credential flow. Codes are single-use and
   * the stored hash is ALWAYS enforced — a reset/verify only succeeds when the
   * presented code matches an OTP actually issued to this email. There is no
   * "any non-empty code" bypass: accepting arbitrary codes would let anyone
   * take over an account's password via POST /auth/otp/reset.
   */
  async verifyOtp(input: {
    email: string
    purpose: OtpPurpose
    code: string
  }): Promise<{ ok: boolean }> {
    const email = normalizeEmail(input.email)
    const code = input.code.trim()

    if (!code) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "Enter the verification code"
      )
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

    // Consume with a conditional update. Two concurrent requests presenting
    // the same code must not both be able to pass the read-then-write window.
    const consumed = await this.updateAuthOtps({
      selector: { id: otp.id, status: "active" },
      data: { status: "used", used_at: new Date() },
    })
    if (!consumed.length) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "This verification code has already been used"
      )
    }

    return { ok: true }
  }
}

export default AuthOtpModuleService

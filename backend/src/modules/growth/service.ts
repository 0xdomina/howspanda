import { randomBytes } from "node:crypto"
import { MedusaError, MedusaService } from "@medusajs/framework/utils"
import Referral from "./models/referral"

const ROUND = 2

class GrowthModuleService extends MedusaService({ Referral }) {
  /**
   * A seller invites a referee email. One referral per seller→email pair —
   * inviting the same buyer twice is a no-op returning the existing row.
   */
  async createForSeller(sellerId: string, refereeEmail: string) {
    const email = refereeEmail.trim().toLowerCase()
    const [existing] = await this.listReferrals({
      referrer_seller_id: sellerId,
      referee_email: email,
    })
    if (existing) {
      return existing
    }
    return await this.createReferrals({
      code: `REF-${randomBytes(6).toString("hex").toUpperCase()}`,
      referrer_role: "seller",
      referrer_seller_id: sellerId,
      referee_email: email,
      status: "pending",
      currency_code: "ngn",
      reward_amount: null,
    })
  }

  /**
   * The referee (or the UI) binds their email to a share code. A code already
   * bound to a different email is a conflict, not a mask.
   */
  async claimByCode(code: string, refereeEmail: string) {
    const normalized = code.trim().toUpperCase()
    const email = refereeEmail.trim().toLowerCase()
    const [referral] = await this.listReferrals({ code: normalized })
    if (!referral) {
      throw new MedusaError(
        MedusaError.Types.NOT_FOUND,
        "Referral code not found"
      )
    }
    if (referral.referee_email && referral.referee_email !== email) {
      throw new MedusaError(
        MedusaError.Types.CONFLICT,
        "This referral code is already bound to another email"
      )
    }
    if (referral.referee_email === email) {
      return referral
    }
    const [updated] = await this.updateReferrals([
      { id: referral.id, referee_email: email },
    ])
    return updated
  }

  async listForSeller(sellerId: string) {
    return await this.listReferrals(
      { referrer_seller_id: sellerId },
      { order: { created_at: "DESC" } }
    )
  }

  /**
   * Idempotent qualification: only a `pending` referral may flip, and the flip
   * happens atomically with the record of the paid commission line. When the
   * referrer has hit their lifetime cap, the referral qualifies with a zero
   * reward and the cap reason recorded (roadmap caps: ₦1,500,000 sellers).
   */
  async markQualified(
    referralId: string,
    {
      rewardAmount,
      commissionLineId = null,
      cappedReason = null,
    }: {
      rewardAmount: number
      commissionLineId?: string | null
      cappedReason?: string | null
    }
  ) {
    const [referral] = await this.listReferrals({ id: referralId })
    if (!referral || referral.status === "qualified") {
      return referral
    }
    const [updated] = await this.updateReferrals([
      {
        id: referralId,
        status: "qualified" as const,
        reward_amount:
          cappedReason === null ? Math.round(rewardAmount * 100) / 100 : 0,
        qualified_at: new Date(),
        paid_commission_line_id: commissionLineId,
        capped_reason: cappedReason,
      },
    ])
    return updated
  }

  async statsForSeller(sellerId: string) {
    const referrals = await this.listReferrals(
      { referrer_seller_id: sellerId },
      { take: null }
    )
    let lifetimePaid = 0
    let qualifiedCount = 0
    for (const r of referrals) {
      if (r.status === "qualified" && r.reward_amount) {
        qualifiedCount += 1
        lifetimePaid = Math.round((lifetimePaid + Number(r.reward_amount)) * 100) / 100
      }
    }
    return {
      count: referrals.length,
      qualified_count: qualifiedCount,
      lifetime_earned: lifetimePaid,
    }
  }
}

export default GrowthModuleService

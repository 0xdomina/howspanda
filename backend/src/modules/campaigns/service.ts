import { MedusaError, MedusaService } from "@medusajs/framework/utils"
import Campaign from "./models/campaign"
import CampaignParticipant from "./models/campaign-participant"
import CampaignReward from "./models/campaign-reward"

const round2 = (n: number) => Math.round(n * 100) / 100

export type CampaignActor =
  | { type: "seller"; sellerId: string }
  | { type: "buyer"; buyerEmail: string }

export type CampaignRewardKind =
  | "wallet_credit"
  | "seller_credit"
  | "giftcard_fixed"
  | "voucher_fixed"

type RewardTemplate = {
  kind?: CampaignRewardKind
  amount_ngn?: number
}

type CampaignCaps = {
  pool_ngn?: unknown
  per_user_cap_ngn?: unknown
  global_cap_ngn?: unknown
}

type SettleRules = {
  settled?: boolean
  settled_pool_ngn?: number
  settled_at?: string
}

type RewardRow = NonNullable<
  Awaited<ReturnType<CampaignsModuleService["createCampaignRewards"]>>
>[number]

class CampaignsModuleService extends MedusaService({
  Campaign,
  CampaignParticipant,
  CampaignReward,
}) {
  /** Resolve a campaign by id or slug; throws NOT_FOUND otherwise. */
  async getCampaign(identifier: string) {
    const [byId] = await this.listCampaigns({ id: identifier })
    if (byId) {
      return byId
    }
    const [bySlug] = await this.listCampaigns({ slug: identifier })
    if (bySlug) {
      return bySlug
    }
    throw new MedusaError(
      MedusaError.Types.NOT_FOUND,
      "Campaign not found"
    )
  }

  /** Campaigns visible on the storefront right now (live + within time bounds). */
  async listLiveCampaigns(now = new Date()) {
    const all = await this.listCampaigns(
      { status: "live" },
      { take: null }
    )
    return all.filter((c) => {
      if (c.starts_at && c.starts_at > now) {
        return false
      }
      if (c.ends_at && c.ends_at < now) {
        return false
      }
      return true
    })
  }

  /** Get-or-create a participant row for a (campaign, actor) pair. */
  async ensureParticipant(campaignId: string, actor: CampaignActor) {
    const filters: Record<string, unknown> = {
      campaign: campaignId,
      actor_type: actor.type,
    }
    if (actor.type === "seller") {
      filters.seller_id = actor.sellerId
    } else {
      filters.buyer_email = actor.buyerEmail.trim().toLowerCase()
    }
    const [existing] = await this.listCampaignParticipants(filters)
    if (existing) {
      return existing
    }
    const [created] = await this.createCampaignParticipants([
      {
        campaign: campaignId,
        actor_type: actor.type,
        seller_id: actor.type === "seller" ? actor.sellerId : null,
        buyer_email:
          actor.type === "buyer" ? actor.buyerEmail.trim().toLowerCase() : null,
        score: 0,
        events: {},
      },
    ])
    return created
  }

  /**
   * Generic scoring hook — record one event for an actor. Idempotent per
   * eventKey: replaying the same source (order, referral, visit) bumps the
   * score once and issues at most one reward. Returns null when the campaign
   * is not currently live (silent no-op, never an error for event producers).
   * Rewards follow the campaign reward_template, subject to the pool and cap
   * guards; when a guard blocks, the score still counts but no reward issues.
   */
  async recordEvent(input: {
    campaign: string
    actor: CampaignActor
    eventKey: string
    scoreDelta?: number
  }) {
    const campaign = await this.getCampaign(input.campaign)
    const now = new Date()
    if (campaign.status !== "live") {
      return null
    }
    if (campaign.starts_at && campaign.starts_at > now) {
      return null
    }
    if (campaign.ends_at && campaign.ends_at < now) {
      return null
    }
    const participant = await this.ensureParticipant(campaign.id, input.actor)
    const events = ((participant.events ?? {}) as Record<string, boolean>)
    if (events[input.eventKey]) {
      return { participant, reward: null, duplicate: true }
    }
    events[input.eventKey] = true
    const score = round2(Number(participant.score) + (input.scoreDelta ?? 1))
    const [updated] = await this.updateCampaignParticipants([
      { id: participant.id, score, events },
    ])

    let reward: RewardRow | null = null
    const template = (campaign.reward_template ?? {}) as RewardTemplate
    const amount = Number(template.amount_ngn ?? 0)
    if (template.kind && amount > 0) {
      if (await this.canIssue(campaign, participant.id, amount)) {
        const [created] = await this.createCampaignRewards([
          {
            campaign: campaign.id,
            participant: participant.id,
            kind: template.kind,
            amount: round2(amount),
            currency_code: "ngn",
            status: "issued" as const,
            issued_at: new Date(),
          },
        ])
        reward = created
      }
    }
    return { participant: updated, reward, duplicate: false }
  }

  /**
   * Pool and cap guard: a reward issues only when it fits the participant cap,
   * the global cap, and the funding pool. Caps of 0/null mean no limit; a
   * pool of 0/null means unfunded-check skipped (admin-funded at settle).
   */
  private async canIssue(
    campaign: CampaignCaps & { id: string },
    participantId: string,
    amount: number
  ) {
    const perUserCap = Number(campaign.per_user_cap_ngn ?? 0)
    if (perUserCap > 0) {
      const mine = await this.participantIssuedNgn(campaign.id, participantId)
      if (mine + amount > perUserCap) {
        return false
      }
    }
    const total = await this.campaignIssuedNgn(campaign.id)
    const globalCap = Number(campaign.global_cap_ngn ?? 0)
    if (globalCap > 0 && total + amount > globalCap) {
      return false
    }
    const pool = Number(campaign.pool_ngn ?? 0)
    if (pool > 0 && total + amount > pool) {
      return false
    }
    return true
  }

  /** Sum of live (non-voided, non-expired) rewards issued to a participant. */
  async participantIssuedNgn(campaignId: string, participantId: string) {
    const rewards = await this.listCampaignRewards(
      { campaign: campaignId, participant: participantId },
      { take: null }
    )
    return rewards.reduce(
      (sum, r) =>
        r.status === "voided" || r.status === "expired"
          ? sum
          : sum + Number(r.amount),
      0
    )
  }

  /** Sum of live (non-voided, non-expired) rewards issued in a campaign. */
  async campaignIssuedNgn(campaignId: string) {
    const rewards = await this.listCampaignRewards(
      { campaign: campaignId },
      { take: null }
    )
    return rewards.reduce(
      (sum, r) =>
        r.status === "voided" || r.status === "expired"
          ? sum
          : sum + Number(r.amount),
      0
    )
  }

  /**
   * Fixed-value mint spec for giftcard/voucher rewards. The claim route mints
   * through redeemables mintRedeemables with face_value from this spec (fixed
   * discount for vouchers), then flips the reward with the code as reference.
   * The amount is fixed forever. Never adjust.
   */
  giftcardMintSpec(reward: { kind: string; amount: unknown }): {
    type: "gift_card" | "voucher"
    face_value: number
  } | null {
    if (reward.kind !== "giftcard_fixed" && reward.kind !== "voucher_fixed") {
      return null
    }
    const face_value = round2(Number(reward.amount))
    if (!(face_value > 0)) {
      return null
    }
    return {
      type: reward.kind === "giftcard_fixed" ? "gift_card" : "voucher",
      face_value,
    }
  }

  /**
   * Idempotent claim flip: issued → claimed with the money reference (wallet
   * ledger id, commission line id, or redeemable code). Money moves in the
   * route BEFORE this flip (wallet credit, commission line, or redeemables
   * mint for giftcard_fixed), and the reference ties the two: a reference
   * already spent on another reward is a hard conflict. A `claimed` reward is
   * a no-op; `voided`/`expired` rewards cannot be claimed.
   */
  async claimReward(rewardId: string, reference: string) {
    const [reward] = await this.listCampaignRewards({ id: rewardId })
    if (!reward) {
      throw new MedusaError(
        MedusaError.Types.NOT_FOUND,
        "Campaign reward not found"
      )
    }
    if (reward.status === "voided") {
      throw new MedusaError(
        MedusaError.Types.CONFLICT,
        "This reward has been voided"
      )
    }
    if (reward.status === "expired") {
      throw new MedusaError(
        MedusaError.Types.CONFLICT,
        "This reward has expired"
      )
    }
    if (reward.status === "claimed") {
      return { reward, changed: false }
    }
    const [other] = await this.listCampaignRewards({ reference })
    if (other && other.id !== reward.id) {
      throw new MedusaError(
        MedusaError.Types.CONFLICT,
        "This reference was already used"
      )
    }
    const [campaign] = await this.listCampaigns({ id: reward.campaign_id })
    if (campaign?.claim_until && campaign.claim_until < new Date()) {
      throw new MedusaError(
        MedusaError.Types.CONFLICT,
        "Claim window closed"
      )
    }
    const [updated] = await this.updateCampaignRewards([
      {
        id: rewardId,
        status: "claimed" as const,
        claimed_at: new Date(),
        reference,
      },
    ])
    return { reward: updated, changed: true }
  }

  /** Per-campaign admin stats (participants + issued/claimed money). */
  async statsForCampaign(campaignId: string) {
    const participants = await this.listCampaignParticipants(
      { campaign: campaignId },
      { take: null }
    )
    const rewards = await this.listCampaignRewards(
      { campaign: campaignId },
      { take: null }
    )
    let issuedNgn = 0
    let claimedNgn = 0
    for (const r of rewards) {
      if (r.status === "voided" || r.status === "expired") {
        continue
      }
      issuedNgn = round2(issuedNgn + Number(r.amount))
      if (r.status === "claimed") {
        claimedNgn = round2(claimedNgn + Number(r.amount))
      }
    }
    return {
      participant_count: participants.length,
      reward_count: rewards.length,
      issued_ngn: issuedNgn,
      claimed_ngn: claimedNgn,
    }
  }

  /**
   * Settle a campaign: split the pool pro-rata across participants by score.
   * Each qualifying share issues a reward in the template kind (default
   * wallet_credit), subject to the pool and cap guards. Runs once — the
   * campaign rules record `settled`.
   */
  async settleCampaign(campaignId: string, poolNgn?: number) {
    const campaign = await this.getCampaign(campaignId)
    const rules = (campaign.rules ?? {}) as SettleRules & Record<string, unknown>
    if (rules.settled) {
      throw new MedusaError(
        MedusaError.Types.CONFLICT,
        "This campaign has already been settled"
      )
    }
    const pool = poolNgn ?? Number(campaign.pool_ngn ?? 0)
    if (!(Number.isFinite(pool) && pool > 0)) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "A positive pool amount is required"
      )
    }
    const participants = await this.listCampaignParticipants(
      { campaign: campaignId },
      { take: null }
    )
    const qualifying = participants.filter((p) => Number(p.score) > 0)
    const totalScore = qualifying.reduce((s, p) => s + Number(p.score), 0)
    if (totalScore <= 0) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "No participants qualify for settlement"
      )
    }
    const template = (campaign.reward_template ?? {}) as RewardTemplate
    const kind = template.kind ?? "wallet_credit"

    const rewards: RewardRow[] = []
    for (const p of qualifying) {
      const share = round2(pool * (Number(p.score) / totalScore))
      if (share <= 0) {
        continue
      }
      if (!(await this.canIssue(campaign, p.id, share))) {
        continue
      }
      const [reward] = await this.createCampaignRewards([
        {
          campaign: campaignId,
          participant: p.id,
          kind,
          amount: share,
          currency_code: "ngn",
          status: "issued" as const,
          issued_at: new Date(),
        },
      ])
      rewards.push(reward)
    }

    await this.updateCampaigns([
      {
        id: campaignId,
        rules: {
          ...rules,
          settled: true,
          settled_pool_ngn: pool,
          settled_at: new Date().toISOString(),
        },
      },
    ])
    return { rewards, total_score: totalScore, pool_ngn: pool }
  }
}

export default CampaignsModuleService

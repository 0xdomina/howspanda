import { randomBytes } from "node:crypto"
import { MedusaError, MedusaService } from "@medusajs/framework/utils"
import Referral from "./models/referral"
import Challenge from "./models/challenge"
import ChallengeParticipant from "./models/challenge-participant"
import ChallengeReward from "./models/challenge-reward"

const ROUND = 2
const round2 = (n: number) => Math.round(n * 100) / 100

// Deterministic PRNG (mulberry32) so a raffle draw is reproducible from its seed
// — fair, auditable, and re-runnable by replaying the seed.
function mulberry32(seed: string) {
  let a = 0
  for (let i = 0; i < seed.length; i++) {
    a = (a * 31 + seed.charCodeAt(i)) >>> 0
  }
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// Leaderboards are public — never ship a full buyer email to anonymous readers.
function maskEmail(email: string) {
  const [local, domain] = email.split("@")
  if (!domain) {
    return email
  }
  const stars = "•".repeat(Math.min(3, Math.max(1, local.length - 1)))
  return `${local.slice(0, 1)}${stars}@${domain}`
}

export type ChallengeActor =
  | { type: "seller"; sellerId: string }
  | { type: "buyer"; buyerEmail: string }

type InviteConfig = {
  milestones?: Array<{ at: number; reward_ngn: number }>
  buyer_reward_ngn?: number
  cap_ngn?: number
}

type ArcPoolConfig = {
  ticket_spend_ngn?: number
  prize_winner_count?: number
}

type RewardRow = NonNullable<
  Awaited<ReturnType<GrowthModuleService["createChallengeRewards"]>>
>[number]

class GrowthModuleService extends MedusaService({
  Referral,
  Challenge,
  ChallengeParticipant,
  ChallengeReward,
}) {
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
          cappedReason === null ? round2(rewardAmount) : 0,
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
        lifetimePaid = round2(lifetimePaid + Number(r.reward_amount))
      }
    }
    return {
      count: referrals.length,
      qualified_count: qualifiedCount,
      lifetime_earned: lifetimePaid,
    }
  }

  // ---- Challenges (Phases 17-18) ----

  /** Resolve a challenge by id or slug; throws NOT_FOUND otherwise. */
  async getChallenge(identifier: string) {
    const [byId] = await this.listChallenges({ id: identifier })
    if (byId) {
      return byId
    }
    const [bySlug] = await this.listChallenges({ slug: identifier })
    if (bySlug) {
      return bySlug
    }
    throw new MedusaError(
      MedusaError.Types.NOT_FOUND,
      "Challenge not found"
    )
  }

  /** Challenges visible on the storefront right now (live + within time bounds). */
  async listLiveChallenges(now = new Date()) {
    const all = await this.listChallenges(
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

  /** Get-or-create a participant row for a (challenge, actor) pair. */
  async ensureParticipant(challengeId: string, actor: ChallengeActor) {
    const filters: Record<string, unknown> = {
      challenge: challengeId,
      actor_type: actor.type,
    }
    if (actor.type === "seller") {
      filters.seller_id = actor.sellerId
    } else {
      filters.buyer_email = actor.buyerEmail.trim().toLowerCase()
    }
    const [existing] = await this.listChallengeParticipants(filters)
    if (existing) {
      return existing
    }
    const [created] = await this.createChallengeParticipants([
      {
        challenge: challengeId,
        actor_type: actor.type,
        seller_id: actor.type === "seller" ? actor.sellerId : null,
        buyer_email:
          actor.type === "buyer" ? actor.buyerEmail.trim().toLowerCase() : null,
        score: 0,
        meta: {},
      },
    ])
    return created
  }

  /**
   * Campaign #1 scoring hook — a referral qualified for a seller. Idempotent per
   * referral: bumps the seller's score once, pays config milestones as seller
   * credits (subject to the campaign cap), and issues the double-sided buyer
   * credit to the invitee. Returns the created rewards (possibly empty).
   */
  async recordInviteQualified(input: {
    sellerId: string
    referralId: string
    refereeEmail: string
  }) {
    const challenges = await this.listLiveChallenges()
    const invite = challenges.find(
      (c) => c.type === "invite" && c.audience !== "buyers"
    )
    if (!invite) {
      return []
    }
    const config = (invite.config ?? {}) as InviteConfig
    const created: RewardRow[] = []

    const seller = await this.ensureParticipant(invite.id, {
      type: "seller",
      sellerId: input.sellerId,
    })
    const sMeta = (seller.meta ?? {}) as { events?: Record<string, boolean> }
    const sEvents = sMeta.events ?? {}
    if (!sEvents[`invite:${input.referralId}`]) {
      sEvents[`invite:${input.referralId}`] = true
      const score = Number(seller.score) + 1
      await this.updateChallengeParticipants([
        { id: seller.id, score, meta: { ...sMeta, events: sEvents } },
      ])

      const issuedNgn = await this.sellerRewardsIssuedNgn(invite.id, seller.id)
      for (const m of config.milestones ?? []) {
        const key = `milestone:${m.at}`
        if (sEvents[key] || score < m.at) {
          continue
        }
        sEvents[key] = true
        const cap = Number(config.cap_ngn ?? 0)
        if (cap > 0 && issuedNgn + m.reward_ngn > cap) {
          continue
        }
        const [reward] = await this.createChallengeRewards([
          {
            challenge: invite.id,
            participant: seller.id,
            kind: "seller_credit" as const,
            amount: round2(m.reward_ngn),
            currency_code: "ngn",
            status: "issued" as const,
            issued_at: new Date(),
          },
        ])
        created.push(reward)
      }
    }

    const refereeEmail = input.refereeEmail.trim().toLowerCase()
    if (refereeEmail && config.buyer_reward_ngn) {
      const buyer = await this.ensureParticipant(invite.id, {
        type: "buyer",
        buyerEmail: refereeEmail,
      })
      const bMeta = (buyer.meta ?? {}) as { events?: Record<string, boolean> }
      const bEvents = bMeta.events ?? {}
      if (!bEvents[`invite:${input.referralId}`]) {
        bEvents[`invite:${input.referralId}`] = true
        const [reward] = await this.createChallengeRewards([
          {
            challenge: invite.id,
            participant: buyer.id,
            kind: "buyer_credit" as const,
            amount: round2(config.buyer_reward_ngn),
            currency_code: "ngn",
            status: "issued" as const,
            issued_at: new Date(),
          },
        ])
        created.push(reward)
        await this.updateChallengeParticipants([
          {
            id: buyer.id,
            meta: { ...bMeta, events: bEvents },
          },
        ])
      }
    }

    return created
  }

  /**
   * Campaign #2 scoring hook — a buyer's qualifying spend. Idempotent per order:
   * score = cumulative spend, tickets accrue every `ticket_spend_ngn` spent.
   */
  async recordBuyerSpend(input: {
    buyerEmail: string
    amountNgn: number
    orderId: string
  }) {
    const challenges = await this.listLiveChallenges()
    const arc = challenges.find((c) => c.type === "arc_pool")
    if (!arc) {
      return null
    }
    const config = (arc.config ?? {}) as ArcPoolConfig
    const ticketSpend = Number(config.ticket_spend_ngn ?? 1000)
    const participant = await this.ensureParticipant(arc.id, {
      type: "buyer",
      buyerEmail: input.buyerEmail,
    })
    const meta = (participant.meta ?? {}) as {
      events?: Record<string, boolean>
      spend_ngn?: number
      tickets?: number
    }
    const events = meta.events ?? {}
    if (events[`spend:${input.orderId}`]) {
      return participant
    }
    events[`spend:${input.orderId}`] = true
    const spend = round2(Number(meta.spend_ngn ?? 0) + input.amountNgn)
    const tickets = Number(meta.tickets ?? 0) + Math.floor(input.amountNgn / ticketSpend)
    await this.updateChallengeParticipants([
      {
        id: participant.id,
        score: spend,
        meta: { ...meta, events, spend_ngn: spend, tickets },
      },
    ])
    return participant
  }

  /** Sum of non-voided seller-credit rewards issued to a participant. */
  async sellerRewardsIssuedNgn(challengeId: string, participantId: string) {
    const rewards = await this.listChallengeRewards(
      {
        challenge: challengeId,
        participant: participantId,
        kind: "seller_credit",
      },
      { take: null }
    )
    return rewards.reduce(
      (sum, r) => (r.status === "voided" ? sum : sum + Number(r.amount)),
      0
    )
  }

  /** Leaderboard for a challenge, newest-joined tiebreak, with caller's rank. */
  async getLeaderboard(
    challengeId: string,
    {
      limit = 20,
      actor,
    }: { limit?: number; actor?: ChallengeActor } = {}
  ) {
    const participants = await this.listChallengeParticipants(
      { challenge: challengeId },
      { order: { score: "DESC" }, take: limit + 1 }
    )
    const rows = participants.slice(0, limit).map((p, i) => ({
      rank: i + 1,
      actor_type: p.actor_type,
      seller_id: p.actor_type === "seller" ? p.seller_id : null,
      buyer_email:
        p.actor_type === "buyer" && p.buyer_email
          ? maskEmail(p.buyer_email)
          : null,
      score: Number(p.score),
    }))
    let mine: Record<string, unknown> | null = null
    if (actor) {
      const filters: Record<string, unknown> = {
        challenge: challengeId,
        actor_type: actor.type,
      }
      if (actor.type === "seller") {
        filters.seller_id = actor.sellerId
      } else {
        filters.buyer_email = actor.buyerEmail.trim().toLowerCase()
      }
      const [p] = await this.listChallengeParticipants(filters)
      if (p) {
        const idx = participants.findIndex((q) => q.id === p.id)
        mine = {
          rank: idx >= 0 ? idx + 1 : null,
          score: Number(p.score),
          tickets: Number((p.meta as any)?.tickets ?? 0),
        }
      }
    }
    return { leaderboard: rows, mine }
  }

  /** A caller-owned participant's rewards in a challenge (newest first). */
  async listRewardsForActor(challengeId: string, actor: ChallengeActor) {
    const filters: Record<string, unknown> = {
      challenge: challengeId,
      actor_type: actor.type,
    }
    if (actor.type === "seller") {
      filters.seller_id = actor.sellerId
    } else {
      filters.buyer_email = actor.buyerEmail.trim().toLowerCase()
    }
    const [participant] = await this.listChallengeParticipants(filters)
    if (!participant) {
      return []
    }
    return await this.listChallengeRewards(
      { participant: participant.id },
      { order: { created_at: "DESC" } }
    )
  }

  /** A reward for a caller-owned participant; throws if not theirs. */
  async getRewardForParticipant(rewardId: string, actor: ChallengeActor) {    const [reward] = await this.listChallengeRewards(
      { id: rewardId },
      { relations: ["participant", "challenge"] }
    )
    if (!reward?.participant) {
      throw new MedusaError(
        MedusaError.Types.NOT_FOUND,
        "Challenge reward not found"
      )
    }
    const p = reward.participant
    const owned =
      actor.type === "seller"
        ? p.seller_id === actor.sellerId
        : (p.buyer_email ?? "").toLowerCase() ===
          actor.buyerEmail.trim().toLowerCase()
    if (!owned) {
      throw new MedusaError(
        MedusaError.Types.UNAUTHORIZED,
        "This reward does not belong to you"
      )
    }
    return reward
  }

  /**
   * Idempotent claim flip: issued → claimed with the money reference (wallet
   * ledger id or commission line id). Money moves in the route AFTER this flip
   * for buyer credits (see store claim route), and the reference ties the two.
   * A `claimed` reward is a no-op; a `voided` reward is a hard conflict.
   */
  async claimReward(rewardId: string, reference: string) {
    const [reward] = await this.listChallengeRewards({ id: rewardId })
    if (!reward) {
      throw new MedusaError(
        MedusaError.Types.NOT_FOUND,
        "Challenge reward not found"
      )
    }
    if (reward.status === "voided") {
      throw new MedusaError(
        MedusaError.Types.CONFLICT,
        "This reward has been voided"
      )
    }
    if (reward.status === "claimed") {
      return { reward, changed: false }
    }
    const [updated] = await this.updateChallengeRewards([
      {
        id: rewardId,
        status: "claimed" as const,
        claimed_at: new Date(),
        reference,
      },
    ])
    return { reward: updated, changed: true }
  }

  /** Per-challenge admin stats (participants + issued/claimed money). */
  async statsForChallenge(challengeId: string) {
    const participants = await this.listChallengeParticipants(
      { challenge: challengeId },
      { take: null }
    )
    const rewards = await this.listChallengeRewards(
      { challenge: challengeId },
      { take: null }
    )
    let issuedNgn = 0
    let claimedNgn = 0
    for (const r of rewards) {
      if (r.status === "voided") {
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
   * Campaign #2 revenue-share settle: each buyer with qualifying spend gets
   * their pro-rata slice of `poolNgn` as an issued buyer credit (ledger source
   * "campaign" on claim). Runs once — the challenge config records `settled`.
   */
  async settleArcPool(challengeId: string, poolNgn: number) {
    const challenge = await this.getChallenge(challengeId)
    if (challenge.type !== "arc_pool") {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "Revenue-share settlement only applies to arc_pool challenges"
      )
    }
    const config = (challenge.config ?? {}) as ArcPoolConfig & {
      settled?: boolean
    }
    if (config.settled) {
      throw new MedusaError(
        MedusaError.Types.CONFLICT,
        "This challenge has already been settled"
      )
    }
    if (!(Number.isFinite(poolNgn) && poolNgn > 0)) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "A positive pool amount is required"
      )
    }
    const participants = await this.listChallengeParticipants(
      { challenge: challengeId, actor_type: "buyer" },
      { take: null }
    )
    const withSpend = participants.filter(
      (p) => Number((p.meta as any)?.spend_ngn ?? 0) > 0
    )
    const totalSpend = withSpend.reduce(
      (s, p) => s + Number((p.meta as any)?.spend_ngn ?? 0),
      0
    )
    if (totalSpend <= 0) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "No buyers have qualifying spend to share the pool across"
      )
    }

    const rewards: RewardRow[] = []
    for (const p of withSpend) {
      const share = round2(poolNgn * (Number((p.meta as any).spend_ngn) / totalSpend))
      if (share <= 0) {
        continue
      }
      const [reward] = await this.createChallengeRewards([
        {
          challenge: challengeId,
          participant: p.id,
          kind: "buyer_credit" as const,
          amount: share,
          currency_code: "ngn",
          status: "issued" as const,
          issued_at: new Date(),
        },
      ])
      rewards.push(reward)
    }

    await this.updateChallenges([
      {
        id: challengeId,
        config: {
          ...config,
          settled: true,
          settled_pool_ngn: poolNgn,
          settled_at: new Date().toISOString(),
        },
      },
    ])
    return { rewards, total_spend: totalSpend, pool_ngn: poolNgn }
  }

  /**
   * Campaign #2 raffle draw: weighted-random selection over accrued tickets,
   * seeded for auditability. Every winner gets `prizeAmountNgn` as an issued
   * buyer credit. Runs once per challenge.
   */
  async drawRaffle(
    challengeId: string,
    {
      winnerCount,
      prizeAmountNgn,
      seed,
    }: { winnerCount?: number; prizeAmountNgn?: number; seed?: string } = {}
  ) {
    const challenge = await this.getChallenge(challengeId)
    if (challenge.type !== "arc_pool") {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "Raffle draws only apply to arc_pool challenges"
      )
    }
    const config = (challenge.config ?? {}) as ArcPoolConfig & {
      drawn?: boolean
      prize_amount_ngn?: number
    }
    if (config.drawn) {
      throw new MedusaError(
        MedusaError.Types.CONFLICT,
        "This challenge has already been drawn"
      )
    }
    const count = winnerCount ?? Number(config.prize_winner_count ?? 1)
    const amount = prizeAmountNgn ?? Number(config.prize_amount_ngn ?? 0)
    if (!Number.isInteger(count) || count < 1) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "winner_count must be a positive integer"
      )
    }
    if (!(Number.isFinite(amount) && amount > 0)) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "A positive raffle prize amount is required"
      )
    }

    const participants = await this.listChallengeParticipants(
      { challenge: challengeId, actor_type: "buyer" },
      { take: null }
    )
    const entrants = participants
      .map((p) => ({
        participant: p,
        tickets: Math.floor(Number((p.meta as any)?.tickets ?? 0)),
      }))
      .filter((e) => e.tickets > 0)
    if (!entrants.length) {
      throw new MedusaError(
        MedusaError.Types.CONFLICT,
        "No participants have raffle tickets yet"
      )
    }

    const rng = mulberry32(
      seed ?? `${challenge.id}:${challenge.updated_at?.toISOString() ?? "now"}`
    )
    const total = entrants.reduce((s, e) => s + e.tickets, 0)
    const winners: typeof entrants = []
    const drawnTickets = new Set<number>()
    const drawnIndices = new Set<number>()
    while (
      winners.length < Math.min(count, entrants.length) &&
      drawnTickets.size < total
    ) {
      const ticket = Math.floor(rng() * total)
      if (drawnTickets.has(ticket)) {
        continue
      }
      drawnTickets.add(ticket)
      let acc = 0
      let idx = 0
      for (let i = 0; i < entrants.length; i++) {
        acc += entrants[i].tickets
        if (ticket < acc) {
          idx = i
          break
        }
      }
      if (drawnIndices.has(idx)) {
        continue
      }
      drawnIndices.add(idx)
      winners.push(entrants[idx])
    }

    const rewards: RewardRow[] = []
    for (const { participant } of winners) {
      const [reward] = await this.createChallengeRewards([
        {
          challenge: challengeId,
          participant: participant.id,
          kind: "buyer_credit" as const,
          amount: round2(amount),
          currency_code: "ngn",
          status: "issued" as const,
          issued_at: new Date(),
        },
      ])
      rewards.push(reward)
    }

    await this.updateChallenges([
      {
        id: challengeId,
        config: {
          ...config,
          drawn: true,
          drawn_seed: seed ?? null,
          drawn_winners: rewards.map((r) => r.participant_id),
          drawn_at: new Date().toISOString(),
        },
      },
    ])
    return { rewards, seed: seed ?? null }
  }
}

export default GrowthModuleService

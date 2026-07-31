import { MedusaContainer } from "@medusajs/framework/types"
import { MARKETPLACE_MODULE } from "../../modules/marketplace"
import type MarketplaceModuleService from "../../modules/marketplace/service"
import { REVIEWS_MODULE } from "../../modules/reviews"
import type ReviewsModuleService from "../../modules/reviews/service"

const DAY_MS = 24 * 60 * 60 * 1000
const DELIVERABLE_AGE_DAYS = 14

export type TrustBreakdown = {
  key: "review_quality" | "fulfillment" | "dispute_health"
  weight: number
  value: number
}

export type TrustScoreResult = {
  score: number | null
  tier: string
  review_count: number
  avg_rating: number
  breakdown: TrustBreakdown[]
}

// A single commission line reduced to the facts the score cares about.
export type LineFact = {
  status: string
  delivered_at: Date | string | null
  confirmed_at: Date | string | null
  held_at: Date | string | null
  created_at: Date | string
}

export function tierFor(score: number | null): string {
  if (score === null) return "New"
  if (score >= 95) return "Top Store"
  if (score >= 85) return "Trusted"
  if (score >= 70) return "Reliable"
  if (score >= 50) return "Rising"
  return "Building"
}

const clamp = (n: number) => Math.max(0, Math.min(100, n))
const round1 = (n: number) => Math.round(n * 10) / 10

// Pure: no container, no I/O — feed it ratings + line facts and it scores.
export function computeTrustScore(input: {
  ratings: number[]
  lines: LineFact[]
  minOrders: number
  now?: Date
}): TrustScoreResult {
  const now = input.now ?? new Date()
  const { ratings, lines, minOrders } = input

  // review_quality — Bayesian average (prior 3.5★, weight 5) rescaled to 0–100
  const n = ratings.length
  const avg = n ? ratings.reduce((a, b) => a + b, 0) / n : 0
  const bayes = (avg * n + 3.5 * 5) / (n + 5)
  const reviewQuality = clamp(((bayes - 1) / 4) * 100)

  // fulfillment — 60% delivered-rate + 40% confirmation-rate
  const deliveredCount = lines.filter((l) => l.delivered_at).length
  const deliverable = lines.filter(
    (l) =>
      l.delivered_at ||
      now.getTime() - new Date(l.created_at).getTime() >
        DELIVERABLE_AGE_DAYS * DAY_MS
  ).length
  const deliveredRate = deliverable ? deliveredCount / deliverable : 1
  const confirmedRate = deliveredCount
    ? lines.filter((l) => l.confirmed_at).length / deliveredCount
    : 1
  const fulfillment = clamp((0.6 * deliveredRate + 0.4 * confirmedRate) * 100)

  // dispute_health — starts 100, scaled penalties for reversals + holds
  const total = lines.length
  const reversed = lines.filter((l) => l.status === "reversed").length
  const holds = lines.filter((l) => l.held_at).length
  const disputeHealth = total
    ? clamp(100 - (reversed / total) * 100 - (holds / total) * 50)
    : 100

  const breakdown: TrustBreakdown[] = [
    { key: "review_quality", weight: 60, value: Math.round(reviewQuality) },
    { key: "fulfillment", weight: 25, value: Math.round(fulfillment) },
    { key: "dispute_health", weight: 15, value: Math.round(disputeHealth) },
  ]

  const avgRating = n ? round1(avg) : 0

  // Cold start: never a fake-precision score below the threshold
  if (deliveredCount < minOrders) {
    return {
      score: null,
      tier: "New",
      review_count: n,
      avg_rating: avgRating,
      breakdown,
    }
  }

  // Score reconciles with the visible bars: Σ (weight/100 × value)
  const score = clamp(
    Math.round(
      breakdown.reduce((sum, b) => sum + (b.weight / 100) * b.value, 0)
    )
  )
  return {
    score,
    tier: tierFor(score),
    review_count: n,
    avg_rating: avgRating,
    breakdown,
  }
}

// I/O wrapper: gather this seller's published ratings + ledger lines, then score.
export async function getTrustScore(
  container: MedusaContainer,
  sellerId: string
): Promise<TrustScoreResult> {
  const reviews = container.resolve<ReviewsModuleService>(REVIEWS_MODULE)
  const marketplace =
    container.resolve<MarketplaceModuleService>(MARKETPLACE_MODULE)

  const published = await reviews.listReviews(
    { seller_id: sellerId, status: "published" },
    { take: null }
  )
  const lines = await marketplace.listCommissionLines(
    { seller_id: sellerId },
    { take: null }
  )

  return computeTrustScore({
    ratings: published.map((r) => r.rating),
    lines: lines.map((l) => ({
      status: l.status,
      delivered_at: l.delivered_at,
      confirmed_at: l.confirmed_at,
      held_at: l.held_at,
      created_at: l.created_at,
    })),
    minOrders: Number(process.env.TRUST_SCORE_MIN_ORDERS ?? 5),
  })
}

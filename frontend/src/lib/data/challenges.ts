"use server"

import { sdk } from "@lib/config"
import { getAuthHeaders } from "./cookies"

export type Challenge = {
  id: string
  name: string
  slug: string
  description?: string | null
  type: "invite" | "arc_pool"
  audience: "sellers" | "buyers" | "all"
  status: "draft" | "live" | "ended"
  starts_at?: string | null
  ends_at?: string | null
  config?: Record<string, unknown> | null
}

export type LeaderboardRow = {
  rank: number
  actor_type: "seller" | "buyer"
  seller_id?: string | null
  buyer_email?: string | null
  score: number
}

export type MyStanding = {
  rank: number | null
  score: number
  tickets?: number
}

export type ChallengeReward = {
  id: string
  challenge_id: string
  participant_id: string
  kind: "buyer_credit" | "seller_credit"
  amount: number | string
  status: "issued" | "claimed" | "voided"
  issued_at: string
  claimed_at?: string | null
}

export const listLiveChallenges = async (): Promise<Challenge[]> => {
  try {
    return await sdk.client
      .fetch<{ challenges: Challenge[] }>("/store/challenges", {
        method: "GET",
        cache: "no-store",
      })
      .then(({ challenges }) => challenges ?? [])
      .catch(() => [])
  } catch {
    return []
  }
}

export const retrieveChallenge = async (
  slug: string
): Promise<{
  challenge: Challenge | null
  leaderboard: LeaderboardRow[]
  mine: MyStanding | null
  myRewards: ChallengeReward[]
}> => {
  try {
    const headers = await getAuthHeaders()
    const res = await sdk.client.fetch<{
      challenge: Challenge
      leaderboard: LeaderboardRow[]
      mine: MyStanding | null
      my_rewards: ChallengeReward[]
    }>(`/store/challenges/${slug}`, {
      method: "GET",
      headers,
      cache: "no-store",
    })
    return {
      challenge: res?.challenge ?? null,
      leaderboard: res?.leaderboard ?? [],
      mine: res?.mine ?? null,
      myRewards: res?.my_rewards ?? [],
    }
  } catch {
    return { challenge: null, leaderboard: [], mine: null, myRewards: [] }
  }
}

export const claimChallengeReward = async (
  slug: string,
  rewardId: string
): Promise<{
  success: boolean
  reward: ChallengeReward | null
  error: string | null
}> => {
  try {
    const headers = await getAuthHeaders()
    const res = await sdk.client.fetch<{ reward: ChallengeReward }>(
      `/store/challenges/${slug}/claim`,
      {
        method: "POST",
        headers,
        body: { reward_id: rewardId },
      }
    )
    return { success: true, reward: res?.reward ?? null, error: null }
  } catch (error: any) {
    return {
      success: false,
      reward: null,
      error: error?.message ?? error?.toString(),
    }
  }
}

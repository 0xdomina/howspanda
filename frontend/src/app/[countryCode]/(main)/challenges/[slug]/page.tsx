import { Metadata } from "next"
import { notFound } from "next/navigation"

import { retrieveChallenge } from "@lib/data/challenges"
import ChallengeDetailClient from "@modules/challenges/templates/challenge-detail"

export const metadata: Metadata = {
  title: "Challenge",
  description: "Campaign details, leaderboard, and rewards.",
}

export default async function ChallengePage({
  params,
}: {
  params: Promise<{ countryCode: string; slug: string }>
}) {
  const { slug } = await params
  const data = await retrieveChallenge(slug).catch(() => ({
    challenge: null,
    leaderboard: [],
    mine: null,
    myRewards: [],
  }))

  if (!data.challenge) {
    notFound()
  }

  return <ChallengeDetailClient {...data} challenge={data.challenge} />
}

import { Metadata } from "next"

import { listLiveChallenges } from "@lib/data/challenges"
import ChallengesClient from "@modules/challenges/templates/challenges-list"

export const metadata: Metadata = {
  title: "Challenges",
  description: "Limited-time campaigns — invite friends, shop, and earn credits.",
}

export default async function ChallengesPage() {
  const challenges = await listLiveChallenges().catch(() => [])
  return <ChallengesClient challenges={challenges} />
}

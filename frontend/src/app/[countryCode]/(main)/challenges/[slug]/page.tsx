import { Metadata } from "next"
import { notFound } from "next/navigation"

import { retrieveChallenge } from "@lib/data/challenges"
import { getBaseURL } from "@lib/util/env"
import ChallengeDetailClient from "@modules/challenges/templates/challenge-detail"

export async function generateMetadata({
  params,
}: {
  params: Promise<{ countryCode: string; slug: string }>
}): Promise<Metadata> {
  const { countryCode, slug } = await params
  const { challenge } = await retrieveChallenge(slug)
  const title = challenge?.name ?? "Challenge"
  const description =
    challenge?.description ?? "Join the next How's u community challenge."
  const url = `${getBaseURL()}/${countryCode}/challenges/${slug}`

  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      title,
      description,
      url,
      siteName: "How's u",
      type: "website",
      images: [{ url: "/opengraph-image.jpg", alt: "How's u challenge" }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: ["/opengraph-image.jpg"],
    },
  }
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

"use client"

import { useMemo } from "react"
import LocalizedClientLink from "@modules/common/components/localized-client-link"
import type { Challenge } from "@lib/data/challenges"

const formatDate = (v: string | null | undefined) =>
  v
    ? new Intl.DateTimeFormat("en-NG", {
        day: "numeric",
        month: "short",
      }).format(new Date(v))
    : null

const typeLabel: Record<Challenge["type"], { title: string; blurb: string }> = {
  invite: {
    title: "Invite friends",
    blurb: "Sellers earn credit for every friend who makes their first purchase.",
  },
  arc_pool: {
    title: "Arc reward pool",
    blurb: "Every purchase earns a share of the pool plus raffle tickets.",
  },
}

const ChallengeCard = ({ challenge }: { challenge: Challenge }) => {
  const endsAt = useMemo(() => formatDate(challenge.ends_at), [challenge.ends_at])
  const meta = typeLabel[challenge.type] ?? typeLabel.arc_pool

  return (
    <div className="flex flex-col rounded-large border border-ink-hairline bg-paper-surface p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <LocalizedClientLink href={`/challenges/${challenge.slug}`}>
            <h3 className="font-display text-lg font-medium text-ink hover:underline">
              {challenge.name}
            </h3>
          </LocalizedClientLink>
          <p className="mt-1 text-sm text-ink-muted line-clamp-2">
            {challenge.description || meta.blurb}
          </p>
        </div>
        <span className="shrink-0 rounded-full bg-emerald-50 px-2 py-0.5 text-xs text-emerald-700">
          Live
        </span>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2 text-center">
        <div className="rounded-medium bg-ink/5 px-2 py-2">
          <p className="text-xs text-ink-muted">Type</p>
          <p className="mt-0.5 text-sm text-ink">{meta.title}</p>
        </div>
        <div className="rounded-medium bg-ink/5 px-2 py-2">
          <p className="text-xs text-ink-muted">Ends</p>
          <p className="mt-0.5 font-mono tabular-nums text-sm text-ink">
            {endsAt ?? "TBA"}
          </p>
        </div>
      </div>

      <LocalizedClientLink
        href={`/challenges/${challenge.slug}`}
        className="mt-4 block w-full rounded-medium bg-ink px-3 py-2 text-center text-sm font-medium text-white hover:bg-ink/90"
      >
        View challenge
      </LocalizedClientLink>
    </div>
  )
}

const ChallengesClient = ({ challenges }: { challenges: Challenge[] }) => {
  return (
    <div
      data-testid="challenges-page"
      className="content-container flex-1 small:py-12"
    >
      <div className="py-8">
        <h1 className="font-display text-3xl font-medium tracking-[-0.02em] text-ink">
          Challenges
        </h1>
        <p className="mt-2 max-w-xl text-sm text-ink-muted">
          Limited-time campaigns. Invite friends, shop, and earn credits that
          land straight in your wallet.
        </p>
      </div>

      {challenges.length === 0 ? (
        <div className="rounded-large border border-dashed py-16 text-center">
          <p className="text-ink-muted">No challenges are live right now.</p>
          <p className="mt-1 text-sm text-ink-muted">
            Check back soon — a new campaign could start any day.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 small:grid-cols-2">
          {challenges.map((challenge) => (
            <ChallengeCard key={challenge.id} challenge={challenge} />
          ))}
        </div>
      )}
    </div>
  )
}

export default ChallengesClient

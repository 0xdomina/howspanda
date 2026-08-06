"use client"

import { useMemo, useState, useTransition } from "react"
import LocalizedClientLink from "@modules/common/components/localized-client-link"
import {
  claimChallengeReward,
  type Challenge,
  type ChallengeReward,
  type LeaderboardRow,
  type MyStanding,
} from "@lib/data/challenges"

const ngn = (v: number | string | undefined) =>
  new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    maximumFractionDigits: 0,
  }).format(Number(v ?? 0))

const formatDate = (v: string | null | undefined) =>
  v
    ? new Intl.DateTimeFormat("en-NG", {
        day: "numeric",
        month: "short",
        year: "numeric",
      }).format(new Date(v))
    : null

const Rules = ({ challenge }: { challenge: Challenge }) => {
  const config = (challenge.config ?? {}) as Record<string, any>
  if (challenge.type === "invite") {
    const milestones = (config.milestones ?? []) as Array<{
      at: number
      reward_ngn: number
    }>
    return (
      <ul className="mt-3 space-y-2 text-sm text-ink-muted">
        {config.buyer_reward_ngn ? (
          <li>
            Every invited friend who completes their first purchase earns you{" "}
            <span className="text-ink">{ngn(config.buyer_reward_ngn)}</span> —
            and they get it too.
          </li>
        ) : null}
        {milestones.length ? (
          <li className="pt-1">
            <span className="text-ink">Milestones:</span>
            <ul className="mt-1 space-y-1 pl-4">
              {milestones.map((m) => (
                <li key={m.at}>
                  {m.at} qualified invite{m.at > 1 ? "s" : ""} →{" "}
                  <span className="text-ink">{ngn(m.reward_ngn)}</span>
                </li>
              ))}
            </ul>
          </li>
        ) : null}
      </ul>
    )
  }
  const ticketSpend = Number(config.ticket_spend_ngn ?? 1000)
  const winners = Number(config.prize_winner_count ?? 3)
  return (
    <ul className="mt-3 space-y-2 text-sm text-ink-muted">
      <li>
        Every <span className="text-ink">{ngn(ticketSpend)}</span> of qualifying
        purchases earns 1 raffle ticket.
      </li>
      <li>At the end, {winners} winners share the prize pool.</li>
      <li>Qualifying spend also earns a pro-rata slice of the revenue pool.</li>
    </ul>
  )
}

const RewardRow = ({
  slug,
  reward,
  onClaimed,
}: {
  slug: string
  reward: ChallengeReward
  onClaimed: (reward: ChallengeReward, message: string) => void
}) => {
  const [isPending, startTransition] = useTransition()
  const claim = () => {
    startTransition(async () => {
      const res = await claimChallengeReward(slug, reward.id)
      if (res.success && res.reward) {
        onClaimed(res.reward, "Reward credited to your wallet.")
      } else {
        onClaimed(reward, res.error ?? "Could not claim this reward.")
      }
    })
  }

  if (reward.status === "claimed") {
    return (
      <div className="flex items-center justify-between rounded-medium bg-emerald-50 px-3 py-2 text-sm">
        <span className="text-emerald-800">{ngn(reward.amount)}</span>
        <span className="text-xs text-emerald-700">Claimed</span>
      </div>
    )
  }

  return (
    <div className="flex items-center justify-between gap-3 rounded-medium bg-ink/5 px-3 py-2 text-sm">
      <span className="text-ink">{ngn(reward.amount)}</span>
      <button
        type="button"
        disabled={isPending}
        onClick={claim}
        className="rounded-medium bg-ink px-3 py-1 text-xs font-medium text-white hover:bg-ink/90 disabled:opacity-50"
      >
        {isPending ? "Claiming…" : "Claim"}
      </button>
    </div>
  )
}

const ChallengeDetailClient = ({
  challenge,
  leaderboard,
  mine,
  myRewards,
}: {
  challenge: Challenge
  leaderboard: LeaderboardRow[]
  mine: MyStanding | null
  myRewards: ChallengeReward[]
}) => {
  const [rewards, setRewards] = useState<ChallengeReward[]>(myRewards)
  const [message, setMessage] = useState<string | null>(null)

  const endsAt = useMemo(() => formatDate(challenge.ends_at), [challenge.ends_at])
  const hasRewards = rewards.length > 0

  const onClaimed = (reward: ChallengeReward, msg: string) => {
    setMessage(msg)
    setRewards((prev) =>
      prev.map((r) => (r.id === reward.id ? reward : r))
    )
  }

  return (
    <div
      data-testid="challenge-page"
      className="content-container flex-1 small:py-12"
    >
      <div className="py-8">
        <LocalizedClientLink
          href="/challenges"
          className="text-sm text-ink-muted hover:text-ink"
        >
          ← All challenges
        </LocalizedClientLink>
        <h1 className="mt-2 font-display text-3xl font-medium tracking-[-0.02em] text-ink">
          {challenge.name}
        </h1>
        <p className="mt-2 max-w-xl text-sm text-ink-muted">
          {challenge.description || "A limited-time campaign."}
        </p>
        <p className="mt-1 text-sm text-ink-muted">
          {endsAt ? `Ends ${endsAt}` : "End date TBA"}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 small:grid-cols-2">
        <div className="rounded-large border border-ink-hairline bg-paper-surface p-5">
          <h2 className="font-display text-lg font-medium text-ink">
            How it works
          </h2>
          <Rules challenge={challenge} />

          {hasRewards ? (
            <div className="mt-5">
              <h3 className="text-sm font-medium text-ink">Your rewards</h3>
              <div className="mt-2 space-y-2">
                {rewards.map((reward) => (
                  <RewardRow
                    key={reward.id}
                    slug={challenge.slug}
                    reward={reward}
                    onClaimed={onClaimed}
                  />
                ))}
              </div>
              {message && <p className="mt-2 text-xs text-ink-muted">{message}</p>}
            </div>
          ) : null}
        </div>

        <div className="rounded-large border border-ink-hairline bg-paper-surface p-5">
          <h2 className="font-display text-lg font-medium text-ink">
            Leaderboard
          </h2>
          {mine ? (
            <p className="mt-2 text-sm text-ink-muted">
              You&rsquo;re ranked{" "}
              <span className="text-ink">
                {mine.rank ? `#${mine.rank}` : "outside the top list"}
              </span>{" "}
              with a score of{" "}
              <span className="text-ink">{ngn(mine.score)}</span>
              {mine.tickets ? ` and ${mine.tickets} raffle ticket(s)` : ""}.
            </p>
          ) : (
            <p className="mt-2 text-sm text-ink-muted">
              Sign in to see your standing.
            </p>
          )}

          <div className="mt-4 space-y-2">
            {leaderboard.length === 0 ? (
              <p className="text-sm text-ink-muted">No participants yet.</p>
            ) : (
              leaderboard.map((row) => (
                <div
                  key={`${row.rank}-${row.actor_type}-${row.seller_id ?? row.buyer_email ?? ""}`}
                  className="flex items-center justify-between rounded-medium bg-ink/5 px-3 py-2 text-sm"
                >
                  <span className="w-8 font-mono text-ink-muted">
                    {row.rank}
                  </span>
                  <span className="flex-1 truncate text-ink">
                    {row.actor_type === "seller"
                      ? "Store"
                      : row.buyer_email ?? "Buyer"}
                  </span>
                  <span className="font-mono tabular-nums text-ink">
                    {ngn(row.score)}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default ChallengeDetailClient

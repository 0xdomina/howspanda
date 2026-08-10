"use client"

import { useState, useTransition } from "react"

import ShareButton from "@modules/common/components/share-button"
import { useShareUrl } from "@lib/hooks/use-share-url"
import { createSellerReferral, type SellerReferral } from "@lib/data/seller"

const money = (amount: number | string | null | undefined) => {
  const value = Number(amount ?? 0)
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(Number.isFinite(value) ? value : 0)
}

const InviteForm = ({ onInvited }: { onInvited: (code: string) => void }) => {
  const [email, setEmail] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const submit = () => {
    setError(null)
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) {
      setError("Enter a valid email address.")
      return
    }
    startTransition(async () => {
      const res = await createSellerReferral(email.trim())
      if (res.success && res.code) {
        setEmail("")
        onInvited(res.code)
      } else {
        setError(res.error ?? "Could not create the referral.")
      }
    })
  }

  return (
    <div className="space-y-3">
      <div>
        <label className="mb-1 block text-xs text-ink-muted">
          Referee email
        </label>
        <input
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="e.g. buyer@example.com"
          type="email"
          className="w-full rounded-medium border border-ink-hairline px-3 py-2 text-sm text-ink outline-none focus:border-ink"
        />
      </div>
      {error && <p className="text-sm text-rose-600">{error}</p>}
      <button
        type="button"
        disabled={isPending}
        onClick={submit}
        className="w-full rounded-medium bg-ink px-3 py-2 text-sm font-medium text-white hover:bg-ink/90 disabled:opacity-50"
      >
        {isPending ? "Inviting…" : "Invite a buyer"}
      </button>
    </div>
  )
}

const ReferralsClient = ({
  referrals,
  stats,
}: {
  referrals: SellerReferral[]
  stats: { count: number; qualified_count: number; lifetime_earned: number }
}) => {
  const [invitedCode, setInvitedCode] = useState<string | null>(null)
  const shareUrl = useShareUrl()

  const buckets = [
    { label: "Invites", value: stats.count },
    { label: "Qualified", value: stats.qualified_count },
    { label: "Earned", value: money(stats.lifetime_earned) },
  ]

  return (
    <div data-testid="seller-referrals-page" className="space-y-6">
      <h2 className="font-display text-2xl font-medium tracking-[-0.02em] text-ink">
        Referrals
      </h2>

      <div className="grid grid-cols-3 gap-4">
        {buckets.map((b) => (
          <div
            key={b.label}
            className="rounded-large border border-ink-hairline bg-paper-surface p-4"
          >
            <p className="text-xs text-ink-muted">{b.label}</p>
            <p className="mt-1 font-mono tabular-nums text-lg text-ink">
              {b.value}
            </p>
          </div>
        ))}
      </div>

      <div className="rounded-large border border-ink-hairline bg-paper-surface p-4">
        <h3 className="font-display text-lg font-medium text-ink">Invite a buyer</h3>
        <p className="mt-1 text-sm text-ink-muted">
          Send an invite by email. When their first order clears escrow, you earn
          a reward through your payout rail. Inviting the same buyer again reuses
          the existing code.
        </p>
        {invitedCode && (
          <div className="mt-3 rounded-medium bg-ink/5 border border-ink-hairline p-3">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs text-ink-muted">Share this code with your buyer:</p>
                <p className="mt-1 font-mono text-lg font-semibold text-ink">{invitedCode}</p>
              </div>
              <ShareButton
                entity="referral"
                entityId={invitedCode}
                payload={{
                  url: shareUrl("/account?mode=register"),
                  text: `Join me on How's u — use my referral code ${invitedCode} when you sign up.`,
                  title: "How's u referral",
                }}
              />
            </div>
          </div>
        )}
        <div className="mt-4 max-w-sm">
          <InviteForm onInvited={(code) => setInvitedCode(code)} />
        </div>
      </div>

      <div className="rounded-large border border-ink-hairline bg-paper-surface p-4">
        <h3 className="font-display text-lg font-medium text-ink">Invites</h3>
        <div className="mt-2">
          {referrals.length === 0 ? (
            <p className="text-sm text-ink-muted">No referrals yet.</p>
          ) : (
            <ul className="divide-y divide-ink-hairline">
              {referrals.map((r) => (
                <li key={r.id} className="flex items-center justify-between gap-4 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-ink">
                      {r.referee_email ?? "Unclaimed"}
                    </p>
                    <p className="truncate text-xs text-ink-muted">
                      {r.code} ·{" "}
                      {r.created_at ? new Date(r.created_at).toLocaleDateString() : ""}
                      {r.capped_reason ? ` — ${r.capped_reason}` : ""}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    {r.reward_amount != null && Number(r.reward_amount) > 0 && (
                      <span className="font-mono tabular-nums text-sm text-ink">
                        {money(r.reward_amount)}
                      </span>
                    )}
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs ${
                        r.status === "qualified"
                          ? "bg-emerald-600/10 text-emerald-700"
                          : "bg-ink/10 text-ink"
                      }`}
                    >
                      {r.status ?? "pending"}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}

export default ReferralsClient
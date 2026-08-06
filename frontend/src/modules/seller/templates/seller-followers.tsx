"use client"

import LocalizedClientLink from "@modules/common/components/localized-client-link"
import type { SellerBroadcast } from "@lib/data/follows"

const TYPE_LABEL: Record<string, string> = {
  general: "General update",
  product: "New product",
  offer: "Special offer",
  voucher: "Voucher for followers",
  giveaway: "Giveaway",
}

const SellerFollowersClient = ({
  followerCount,
  remaining,
  broadcasts,
}: {
  followerCount: number
  remaining: number
  broadcasts: SellerBroadcast[]
}) => {
  const delivered = broadcasts.reduce((sum, b) => sum + (b.delivered ?? 0), 0)
  const read = broadcasts.reduce((sum, b) => sum + (b.read_count ?? 0), 0)

  return (
    <div className="space-y-6">
      <h2 className="font-display text-2xl font-medium tracking-[-0.02em] text-ink">
        Followers
      </h2>

      <div className="grid grid-cols-1 small:grid-cols-3 gap-3">
        <div className="rounded-large border border-ink-hairline bg-paper-surface p-4">
          <p className="text-xs text-ink-muted">Followers</p>
          <p className="mt-1 font-display text-3xl font-medium text-ink">
            {followerCount.toLocaleString()}
          </p>
        </div>
        <div className="rounded-large border border-ink-hairline bg-paper-surface p-4">
          <p className="text-xs text-ink-muted">Updates delivered</p>
          <p className="mt-1 font-display text-3xl font-medium text-ink">
            {delivered.toLocaleString()}
          </p>
        </div>
        <div className="rounded-large border border-ink-hairline bg-paper-surface p-4">
          <p className="text-xs text-ink-muted">Updates read</p>
          <p className="mt-1 font-display text-3xl font-medium text-ink">
            {read.toLocaleString()}
          </p>
        </div>
      </div>

      <div className="rounded-large border border-ink-hairline bg-paper-surface p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="font-display text-lg font-medium text-ink">
              Talk to your followers
            </h3>
            <p className="mt-1 text-xs text-ink-muted">
              {remaining} of 3 broadcasts left this week. Broadcasts are private —
              you never see who your followers are, and they never see your
              contact details. Followers only see updates here, in-app.
            </p>
          </div>
          <LocalizedClientLink
            href="/seller/broadcasts"
            className="shrink-0 rounded-medium bg-ink px-3 py-2 text-sm font-medium text-white hover:bg-ink/90"
          >
            New broadcast
          </LocalizedClientLink>
        </div>
      </div>

      <div className="rounded-large border border-ink-hairline bg-paper-surface p-4">
        <h3 className="font-display text-lg font-medium text-ink">Recent updates</h3>
        {broadcasts.length === 0 ? (
          <p className="mt-2 text-sm text-ink-muted">No broadcasts yet.</p>
        ) : (
          <ul className="mt-2 divide-y divide-ink-hairline">
            {broadcasts.slice(0, 10).map((b) => (
              <li key={b.id} className="py-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-medium text-ink">{b.title}</p>
                  <span className="shrink-0 rounded-full bg-ink/5 px-2 py-0.5 text-xs text-ink">
                    {TYPE_LABEL[b.type] ?? b.type}
                  </span>
                </div>
                <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-muted">
                  <span>{b.delivered ?? 0} delivered</span>
                  <span>{b.read_count ?? 0} read</span>
                  {b.giveaway_claims_count != null && (
                    <span>{b.giveaway_claims_count} claims</span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

export default SellerFollowersClient

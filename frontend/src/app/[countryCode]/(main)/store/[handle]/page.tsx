import { Metadata } from "next"
import { notFound } from "next/navigation"
import LocalizedClientLink from "@modules/common/components/localized-client-link"
import { getStoreProfile } from "@lib/data/follows"
import FollowButton from "@modules/store/components/follow-button"

export async function generateMetadata({
  params,
}: {
  params: Promise<{ handle: string }>
}): Promise<Metadata> {
  const { handle } = await params
  const profile = await getStoreProfile(handle).catch(() => null)
  return {
    title: profile?.seller.name ?? handle,
    description: profile?.seller.description ?? undefined,
  }
}

export default async function StorePage({
  params,
}: {
  params: Promise<{ handle: string; countryCode: string }>
}) {
  const { handle, countryCode } = await params
  const profile = await getStoreProfile(handle).catch(() => null)

  if (!profile) {
    notFound()
  }

  const { seller, follower_count, followed_by_viewer, products, broadcasts, trust } =
    profile

  return (
    <div className="content-container flex flex-col gap-10 py-8 small:py-14">
      {/* Store header */}
      <section className="flex flex-col gap-6 small:flex-row small:items-start small:justify-between">
        <div className="flex items-start gap-4">
          {seller.logo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={seller.logo}
              alt={seller.name}
              className="h-16 w-16 rounded-full object-cover"
            />
          ) : (
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-ink/10 text-xl font-medium text-ink">
              {seller.name.slice(0, 1).toUpperCase()}
            </div>
          )}
          <div>
            <div className="flex items-center gap-2">
              <h1 className="font-display text-2xl font-medium tracking-[-0.02em] text-ink">
                {seller.name}
              </h1>
              {seller.verification_status === "verified" && (
                <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
                  Verified
                </span>
              )}
            </div>
            <p className="mt-1 text-sm text-ink-muted">@{seller.handle}</p>
            {seller.description && (
              <p className="mt-2 max-w-xl text-sm text-ink">{seller.description}</p>
            )}
            {trust.tier && (
              <p className="mt-2 text-xs text-ink-muted">
                {trust.tier} store · {trust.review_count} review
                {trust.review_count === 1 ? "" : "s"}
                {trust.avg_rating ? ` · ${trust.avg_rating}/5` : ""}
              </p>
            )}
          </div>
        </div>
        <FollowButton
          handle={handle}
          initialFollowing={followed_by_viewer}
          initialCount={follower_count}
        />
      </section>

      {/* Recent broadcasts */}
      {broadcasts.length > 0 && (
        <section>
          <h2 className="mb-3 font-display text-xl font-medium text-ink">
            Latest updates
          </h2>
          <ul className="space-y-3">
            {broadcasts.map((b) => (
              <li
                key={b.id}
                className="rounded-medium border border-ink-hairline bg-paper-surface p-4"
              >
                <p className="text-sm font-medium text-ink">{b.title}</p>
                <p className="mt-1 text-sm text-ink-muted">{b.body}</p>
                <p className="mt-2 text-xs text-ink-muted">
                  {b.created_at
                    ? new Date(b.created_at).toLocaleDateString()
                    : ""}
                </p>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Products */}
      <section>
        <h2 className="mb-4 font-display text-xl font-medium text-ink">Products</h2>
        {products.length === 0 ? (
          <p className="text-sm text-ink-muted">No products listed yet.</p>
        ) : (
          <ul className="grid grid-cols-2 gap-4 small:grid-cols-3 medium:grid-cols-4">
            {products.map((p) => (
              <li key={p.id}>
                <LocalizedClientLink
                  href={`/${countryCode}/products/${p.handle}`}
                  className="group block"
                >
                  {p.thumbnail ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={p.thumbnail}
                      alt={p.title}
                      className="aspect-square w-full rounded-medium object-cover"
                    />
                  ) : (
                    <div className="aspect-square w-full rounded-medium bg-ink/5" />
                  )}
                  <p className="mt-2 text-sm text-ink group-hover:text-ink-muted">
                    {p.title}
                  </p>
                </LocalizedClientLink>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

import { Metadata } from "next"
import { notFound } from "next/navigation"
import LocalizedClientLink from "@modules/common/components/localized-client-link"
import ShareButton from "@modules/common/components/share-button"
import { getStoreProfile } from "@lib/data/follows"
import FollowButton from "@modules/store/components/follow-button"
import { getBaseURL } from "@lib/util/env"
import RedeemableCard from "@modules/redeemables/components/redeemable-card"
import ProductShare from "@modules/products/components/product-share"
import RequestProduct from "@modules/store/components/request-product"

const visualFor = (variant?: string) => {
  const defaults: Record<string, string> = {
    sunset: "linear-gradient(135deg,#ef4444,#f59e0b)",
    midnight: "linear-gradient(135deg,#111827,#4338ca)",
    mint: "linear-gradient(135deg,#047857,#a7f3d0)",
    candy: "linear-gradient(135deg,#db2777,#c084fc)",
    cobalt: "linear-gradient(135deg,#2563eb,#22d3ee)",
  }
  return defaults[variant ?? ""] ?? defaults.sunset
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ handle: string; countryCode: string }>
}): Promise<Metadata> {
  const { handle, countryCode } = await params
  const profile = await getStoreProfile(handle).catch(() => null)
  const title = profile?.seller.name ?? handle
  const description =
    profile?.seller.description ?? `Shop ${title} on How's u`
  const image = profile?.seller.cover_image ?? profile?.seller.logo ?? undefined
  const url = `${getBaseURL()}/${countryCode}/store/${handle}`
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      title,
      description,
      url,
      images: image
        ? [{ url: image, alt: `${title} storefront on How's u` }]
        : undefined,
      type: "website",
      siteName: "How's u",
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: image ? [image] : ["/opengraph-image.jpg"],
    },
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
    <div className="figma-container flex flex-col gap-12 py-10 small:py-16">
      {/* Store header */}
      <section className="glass-panel relative overflow-hidden rounded-control p-6 small:p-8" style={{ borderColor: `${seller.accent_color ?? "#ef4444"}33` }}>
        <div className="absolute inset-x-0 top-0 h-28 opacity-90" style={{ background: visualFor(seller.theme) }} />
        {seller.cover_image && <img src={seller.cover_image} alt="" loading="lazy" decoding="async" className="absolute inset-x-0 top-0 h-28 w-full object-cover opacity-70" />}
        <div className="absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-transparent to-white/90" />
        <div className="relative flex flex-col gap-6 pt-10 small:flex-row small:items-end small:justify-between">
        <div className="flex items-end gap-4">
          {seller.logo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={seller.logo}
              alt={seller.name}
              loading="lazy"
              decoding="async"
              className="h-20 w-20 rounded-full border-4 border-white object-cover shadow-sm"
            />
          ) : (
            <div className="flex h-20 w-20 items-center justify-center rounded-full border-4 border-white bg-ink/10 text-xl font-medium text-ink shadow-sm">
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
              {seller.verification_status === "pending" && (
                <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">
                  Verification pending
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
        <div className="flex items-center gap-2">
          <FollowButton
            handle={handle}
            initialFollowing={followed_by_viewer}
            initialCount={follower_count}
          />
          <ShareButton
            entity="store"
            entityId={seller.handle}
            payload={{
              url: `${getBaseURL()}/${countryCode}/store/${seller.handle}`,
              text: `${seller.name} on How's u`,
              title: seller.name,
              description:
                seller.description || "Explore this independent storefront on How's u.",
              image: seller.logo ?? undefined,
            }}
          />
        </div>
        </div>
        <RequestProduct handle={handle} />
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
                className="figma-surface p-4"
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

      {profile.redeemables.length > 0 && (
        <section>
          <div className="mb-4 flex items-end justify-between gap-4">
            <div><p className="text-xs font-medium uppercase tracking-[0.16em] text-ink-muted">Made for sharing</p><h2 className="mt-1 font-display text-xl font-medium text-ink">Gift cards, tickets & vouchers</h2></div>
            <span className="text-xs text-ink-muted">Pick a little joy</span>
          </div>
          <div className="grid gap-4 small:grid-cols-2 large:grid-cols-3">
            {profile.redeemables.map((item) => (
              <div key={item.id}>
                <RedeemableCard
                  type={item.type}
                  title={item.title}
                  message={item.message}
                  design={item.design_variant}
                  image={item.background_image}
                  accentColor={item.accent_color}
                  faceValue={item.face_value}
                  discountType={item.discount_type}
                  discountValue={item.discount_value}
                  price={item.price}
                  eventName={item.event_name}
                  venueName={item.venue_name}
                  venueAddress={item.venue_address}
                  eventStartsAt={item.event_starts_at}
                  eventEndsAt={item.event_ends_at}
                  expiresAt={item.expires_at}
                  storeName={seller.name}
                  storeLogo={seller.logo}
                  mode="listing"
                />
                {item.product_handle && <LocalizedClientLink href={`/products/${item.product_handle}`} className="mt-2 block text-center text-sm font-semibold text-ink hover:underline">Get this {item.type === "ticket" ? "pass" : item.type.replace("_", " ")}</LocalizedClientLink>}
              </div>
            ))}
          </div>
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
                      loading="lazy"
                      decoding="async"
                      className="aspect-square w-full rounded-control border border-ink-hairline object-cover"
                    />
                  ) : (
                    <div className="aspect-square w-full rounded-control border border-ink-hairline bg-ink/5" />
                  )}
                  <p className="mt-2 text-sm text-ink group-hover:text-ink-muted">
                    {p.title}
                  </p>
                </LocalizedClientLink>
                <div className="mt-2 flex justify-end">
                  <ProductShare product={p} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

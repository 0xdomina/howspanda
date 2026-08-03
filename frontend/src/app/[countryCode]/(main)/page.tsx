import { Metadata } from "next"

import Hero from "@modules/home/components/hero"
import LocalizedClientLink from "@modules/common/components/localized-client-link"
import PaginatedProducts from "@modules/store/templates/paginated-products"
import { getRegion } from "@lib/data/regions"

export const metadata: Metadata = {
  title: "Shop more. Sell more.",
  description:
    "How's u is a marketplace where informal sellers, buyers, and couriers win. Buy from people, sell what you make, and get paid on time.",
}

export default async function Home(props: {
  params: Promise<{ countryCode: string }>
  searchParams?: Promise<{ page?: string }>
}) {
  const params = await props.params
  const searchParams = await props.searchParams
  const { countryCode } = params

  const region = await getRegion(countryCode)

  if (!region) {
    return null
  }

  const page = searchParams?.page ? parseInt(searchParams.page) : 1

  return (
    <>
      <Hero />
      <div
        className="content-container py-6"
        data-testid="home-feed"
      >
        <h2 className="mb-4 font-display text-2xl font-medium tracking-[-0.02em] text-ink">
          Shop the marketplace
        </h2>
        <PaginatedProducts
          sortBy="created_at"
          page={page}
          countryCode={countryCode}
        />
      </div>

      <div className="content-container pb-16">
        <div className="grid grid-cols-1 gap-4 small:grid-cols-2">
          <LocalizedClientLink href="/seller">
            <div className="rounded-large border border-ink-hairline bg-paper-tinted p-6 transition-colors duration-fast hover:bg-paper-surface">
              <h3 className="font-display text-xl font-medium text-ink">
                Want to sell?
              </h3>
              <p className="mt-1 text-sm text-ink-muted">
                List what you make in minutes and get paid on time. No storefront
                setup, no monthly fees.
              </p>
              <span className="mt-3 inline-block text-sm font-medium text-ink">
                Become a seller →
              </span>
            </div>
          </LocalizedClientLink>
          <LocalizedClientLink href="/deliver">
            <div className="rounded-large border border-ink-hairline bg-paper-tinted p-6 transition-colors duration-fast hover:bg-paper-surface">
              <h3 className="font-display text-xl font-medium text-ink">
                Want to deliver?
              </h3>
              <p className="mt-1 text-sm text-ink-muted">
                Earn for every delivery you complete — deliveries, pickups, and
                courier jobs in your area.
              </p>
              <span className="mt-3 inline-block text-sm font-medium text-ink">
                Start delivering →
              </span>
            </div>
          </LocalizedClientLink>
        </div>
      </div>
    </>
  )
}

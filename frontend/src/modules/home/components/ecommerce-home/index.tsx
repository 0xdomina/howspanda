import LocalizedClientLink from "@modules/common/components/localized-client-link"
import ProductPreview from "@modules/products/components/product-preview"
import AutoCarousel from "@modules/home/components/auto-carousel"
import PromoBannerCarousel from "@modules/home/components/promo-banner-carousel"
import FlashSaleCountdown from "@modules/home/components/flash-sale-countdown"
import CatalogRetry from "@modules/home/components/catalog-retry"
import CatalogSnapshot from "@modules/home/components/catalog-snapshot"
import OnboardingJourney from "@modules/home/components/onboarding-journey"
import { getRegion } from "@lib/data/regions"
import { listProductsWithSort } from "@lib/data/products"
import { retrieveCustomer } from "@lib/data/customer"
import { getFlashSaleCycle } from "@lib/util/flash-sales"
import type { HttpTypes } from "@medusajs/types"

function SectionTitle({ eyebrow, title }: { eyebrow: string; title: string }) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-4 text-sm font-semibold text-brand">
        <span className="h-10 w-5 rounded bg-brand" aria-hidden="true" />
        {eyebrow}
      </div>
      <h2 className="font-display text-3xl font-semibold tracking-tight text-ink small:text-4xl">
        {title}
      </h2>
    </div>
  )
}

const EmptySlate = ({ message }: { message: string }) => (
  <div className="flex min-h-[220px] items-center justify-center rounded-control border border-dashed border-ink-hairline bg-paper-tinted/50 px-6 text-center">
    <p className="text-sm text-ink-muted">{message}</p>
  </div>
)

export default async function EcommerceHome({ countryCode }: { countryCode: string }) {
  const [region, customer] = await Promise.all([
    getRegion(countryCode),
    retrieveCustomer(),
  ])
  let products: HttpTypes.StoreProduct[] = []

  if (region) {
    try {
      const { response } = await listProductsWithSort({
        page: 1,
        queryParams: { limit: 100 },
        sortBy: "created_at",
        countryCode,
        publicCache: true,
      })
      products = response.products
    } catch {
      // A sleeping API should never turn the storefront into an error page.
      // CatalogRetry will refresh once the API is ready.
      products = []
    }
  }

  const cycle = getFlashSaleCycle()
  const promotionMetadata = (product: HttpTypes.StoreProduct) =>
    (product.metadata ?? {}) as Record<string, unknown>
  const selectedFlash = products.filter((product) => {
    const metadata = promotionMetadata(product)
    return metadata.flash_sale === true && Number(metadata.flash_sale_cycle) === cycle.id
  })
  const hasConfiguredFlash = products.some((product) => promotionMetadata(product).flash_sale === true)
  const selectedBanners = products.filter((product) => promotionMetadata(product).homepage_banner === true)
  const hasProducts = products.length > 0
  // Active-cycle picks first; between cycles (or before sellers re-flag),
  // keep the section alive with the freshest products instead of going empty.
  const flash = (selectedFlash.length ? selectedFlash : products).slice(0, 6)
  const banners = (selectedBanners.length ? selectedBanners : products).slice(0, 5)
  const best = products.slice(0, 6).reverse()
  const explore = products.slice(0, 8)

  const slides = (list: HttpTypes.StoreProduct[]) =>
    list.map((p) => (
      <ProductPreview key={p.id} product={p} region={region!} />
    ))

  return (
    <div className="bg-white">
      <section className="figma-container pt-6 small:pt-8" aria-label="Welcome to How's U">
        <div className="soft-glass flex flex-col gap-5 rounded-[24px] p-5 small:flex-row small:items-center small:justify-between small:p-7">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-brand">How&rsquo;s U marketplace</p>
            <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight text-ink small:text-4xl">Find your next good thing.</h1>
            <p className="mt-2 max-w-xl text-sm leading-6 text-ink-muted">Shop from independent stores, keep your favourites close, and join in whenever you&rsquo;re ready.</p>
          </div>
          <div className="flex shrink-0 flex-wrap gap-3">
            {customer ? (
              <LocalizedClientLink href="/account" className="figma-button">Open your account</LocalizedClientLink>
            ) : (
              <>
                <LocalizedClientLink href="/account?mode=login" className="inline-flex items-center justify-center rounded-control border border-ink-hairline bg-white/60 px-5 py-3 text-sm font-medium text-ink transition duration-200 hover:-translate-y-0.5 hover:bg-white active:scale-[0.98]">Log in</LocalizedClientLink>
                <LocalizedClientLink href="/account?mode=register" className="figma-button">Sign up</LocalizedClientLink>
              </>
            )}
          </div>
        </div>
      </section>
      <OnboardingJourney />
      {hasProducts ? (
        <>
          <PromoBannerCarousel products={banners} countryCode={countryCode} />
          <section className="figma-container py-16 small:py-24">
            <div className="flex flex-col justify-between gap-8 small:flex-row small:items-end">
              <SectionTitle eyebrow="Today’s" title="Flash Sales" />
              <FlashSaleCountdown endsAt={cycle.endsAt} />
            </div>
            <div className="mt-10">
              {flash.length ? (
                <AutoCarousel slides={slides(flash)} cardClassName="w-[64%] small:w-[44%] medium:w-[23%]" ariaLabel="Flash sale products" />
              ) : (
                <EmptySlate message="New flash sale picks arrive every three days." />
              )}
            </div>
            <div className="mt-8 text-center"><LocalizedClientLink href="/store" className="figma-button">View All Products</LocalizedClientLink></div>
          </section>

          <section className="figma-container py-16 small:py-24">
            <div className="flex items-end justify-between gap-4">
              <SectionTitle eyebrow="This Month" title="Best Selling Products" />
              <LocalizedClientLink href="/store" className="figma-button hidden small:inline-flex">View All</LocalizedClientLink>
            </div>
            <div className="mt-10">
              <AutoCarousel slides={slides(best)} cardClassName="w-[64%] small:w-[44%] medium:w-[23%]" ariaLabel="Best selling products" />
            </div>
          </section>

          <section className="figma-container py-16 small:py-24">
            <div className="flex items-end justify-between">
              <SectionTitle eyebrow="Our Products" title="Explore Our Products" />
              <LocalizedClientLink href="/store" className="figma-button hidden small:inline-flex">View All</LocalizedClientLink>
            </div>
            <div className="mt-10 grid grid-cols-2 gap-x-4 gap-y-12 small:grid-cols-4 small:gap-x-7">
              {explore.map((p) => <ProductPreview key={p.id} product={p} region={region!} />)}
            </div>
            <div className="mt-10 text-center small:hidden"><LocalizedClientLink href="/store" className="figma-button">View All</LocalizedClientLink></div>
          </section>
        </>
      ) : (
        <>
          <CatalogRetry />
          <CatalogSnapshot products={products} />
        </>
      )}
    </div>
  )
}

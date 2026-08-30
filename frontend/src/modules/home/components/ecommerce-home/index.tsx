import LocalizedClientLink from "@modules/common/components/localized-client-link"
import ProductPreview from "@modules/products/components/product-preview"
import AutoCarousel from "@modules/home/components/auto-carousel"
import PromoBannerCarousel from "@modules/home/components/promo-banner-carousel"
import FlashSaleCountdown from "@modules/home/components/flash-sale-countdown"
import CatalogRetry from "@modules/home/components/catalog-retry"
import { getRegion } from "@lib/data/regions"
import { listProductsWithSort } from "@lib/data/products"
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
  const region = await getRegion(countryCode)
  let products: HttpTypes.StoreProduct[] = []

  if (region) {
    const { response } = await listProductsWithSort({
      page: 1,
      queryParams: { limit: 100 },
      sortBy: "created_at",
      countryCode,
    })
    products = response.products
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
        <section className="figma-container py-16 small:py-24">
          <CatalogRetry />
          <SectionTitle eyebrow="Marketplace" title="Explore How’s U" />
          <div className="mt-10"><EmptySlate message="Products from independent sellers will appear here." /></div>
          <div className="mt-8 text-center"><LocalizedClientLink href="/store" className="figma-button">Browse the marketplace</LocalizedClientLink></div>
        </section>
      )}
    </div>
  )
}

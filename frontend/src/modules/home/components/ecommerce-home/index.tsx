import LocalizedClientLink from "@modules/common/components/localized-client-link"
import ProductPreview from "@modules/products/components/product-preview"
import AutoCarousel from "@modules/home/components/auto-carousel"
import { getRegion } from "@lib/data/regions"
import { listProductsWithSort } from "@lib/data/products"
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
      queryParams: { limit: 8 },
      sortBy: "created_at",
      countryCode,
    })
    products = response.products
  }

  const hasProducts = products.length > 0
  const flash = products.slice(0, 6)
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
          <section className="figma-container py-16 small:py-24">
            <div className="flex flex-col justify-between gap-8 small:flex-row small:items-end">
              <SectionTitle eyebrow="Today’s" title="Flash Sales" />
              <div className="flex items-center gap-3 text-sm font-semibold text-ink" aria-label="Flash sale countdown">
                {[['Just', 'for'], ['today', 'only'], ['while', 'stocks last']].map(([value, label]) => (
                  <span key={label} className="text-center"><strong className="block text-xl">{value}</strong>{label}</span>
                ))}
              </div>
            </div>
            <div className="mt-10">
              <AutoCarousel slides={slides(flash)} cardClassName="w-[64%] small:w-[44%] medium:w-[23%]" ariaLabel="Flash sale products" />
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
          <SectionTitle eyebrow="Marketplace" title="Explore How’s U" />
          <div className="mt-10"><EmptySlate message="Products from independent sellers will appear here." /></div>
          <div className="mt-8 text-center"><LocalizedClientLink href="/store" className="figma-button">Browse the marketplace</LocalizedClientLink></div>
        </section>
      )}
    </div>
  )
}

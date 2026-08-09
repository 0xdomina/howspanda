import LocalizedClientLink from "@modules/common/components/localized-client-link"
import PaginatedProducts from "@modules/store/templates/paginated-products"
import QuickView from "@modules/products/components/quick-view"
import WishlistButton from "@modules/wishlist/components/wishlist-button"

const products = [
  ["The north coat", "$260", "$360", "/figma/home/coat.png", "The North Face and Gucci coat"],
  ["Gucci duffle bag", "$960", "$1,160", "/figma/home/gucci-bag.png", "Gucci duffle bag"],
  ["RGB liquid CPU Cooler", "$160", "$170", "/figma/home/cooler.png", "RGB liquid CPU cooler"],
  ["Small BookSelf", "$360", "", "/figma/home/coat.png", "Small bookshelf"],
] as const

function SectionTitle({ eyebrow, title }: { eyebrow: string; title: string }) {
  return <div className="flex flex-col gap-3"><div className="flex items-center gap-4 text-sm font-semibold text-brand"><span className="h-10 w-5 rounded bg-brand" aria-hidden="true" />{eyebrow}</div><h2 className="font-display text-3xl font-semibold tracking-tight text-ink small:text-4xl">{title}</h2></div>
}

function ProductCard({ product, compact = false }: { product: (typeof products)[number]; compact?: boolean }) {
  const [name, price, oldPrice, image, alt] = product

  return <article className={compact ? "group min-w-0" : "group min-w-[220px] flex-1"}>
    <div className="relative flex h-[250px] items-center justify-center overflow-hidden rounded-control bg-[#f5f5f5] p-6">
      <div className="absolute right-3 top-3 z-10 flex flex-col gap-2"><WishlistButton item={{ id: name, title: name, thumbnail: image, price }} /><QuickView item={{ title: name, thumbnail: image, price, href: "/store" }} /></div>
      <img src={image} alt={alt} className="h-full max-h-[180px] w-full object-contain transition-transform duration-moderate group-hover:scale-105" />
    </div>
    <h3 className="mt-4 font-medium text-ink">{name}</h3>
    <div className="mt-2 flex items-center gap-3 text-sm"><span className="font-semibold text-brand">{price}</span>{oldPrice && <span className="text-ink-muted line-through">{oldPrice}</span>}</div>
    <div className="mt-2 text-amber-500" aria-label="4 out of 5 stars">★★★★★<span className="ml-2 text-xs text-ink-muted">(65)</span></div>
  </article>
}

export default function EcommerceHome({ countryCode, page }: { countryCode: string; page: number }) {
  return <div className="bg-white">
    <section className="figma-container border-b border-ink-hairline py-8 small:py-10"><div className="min-h-[350px] overflow-hidden rounded-control bg-black"><div className="relative grid min-h-[350px] items-center overflow-hidden px-8 py-10 text-white small:grid-cols-2 small:px-16"><div className="relative z-10 max-w-sm"><div className="flex items-center gap-4 text-base"><img src="/figma/home/apple-logo.png" alt="Apple" className="h-12 w-10 object-contain" /><span>iPhone 14 Series</span></div><h1 className="mt-8 font-display text-5xl font-semibold leading-[1.12] tracking-tight small:text-6xl">Up to 10% off Voucher</h1><LocalizedClientLink href="/store" className="mt-8 inline-flex items-center gap-2 border-b border-white pb-1 text-base font-medium">Shop Now <span aria-hidden="true">→</span></LocalizedClientLink></div><img src="/figma/home/hero.png" alt="iPhone 14 Series promotion" className="absolute bottom-0 right-[-12%] h-[42%] w-[72%] object-contain object-right opacity-95 small:right-0 small:h-full small:w-[70%]" /></div></div></section>

    <section className="figma-container py-16 small:py-24"><div className="flex flex-col justify-between gap-8 small:flex-row small:items-end"><SectionTitle eyebrow="Today’s" title="Flash Sales" /><div className="flex items-center gap-3 text-sm font-semibold text-ink">{[["03", "Days"], ["23", "Hours"], ["19", "Minutes"]].map(([value, label]) => <span key={label} className="text-center"><strong className="block text-xl">{value}</strong>{label}</span>)}</div></div><div className="mt-10 flex gap-7 overflow-x-auto pb-4">{products.map((product) => <ProductCard key={product[0]} product={product} />)}</div><div className="mt-8 text-center"><LocalizedClientLink href="/store" className="figma-button">View All Products</LocalizedClientLink></div></section>

    <section className="figma-container py-16 small:py-24"><div className="flex items-end justify-between gap-4"><SectionTitle eyebrow="This Month" title="Best Selling Products" /><LocalizedClientLink href="/store" className="figma-button hidden small:inline-flex">View All</LocalizedClientLink></div><div className="mt-10 flex gap-7 overflow-x-auto pb-4">{products.map((product) => <ProductCard key={`best-${product[0]}`} product={product} />)}</div></section>

    <section className="figma-container py-16 small:py-24"><div className="flex items-end justify-between"><SectionTitle eyebrow="Our Products" title="Explore Our Products" /><LocalizedClientLink href="/store" className="figma-button hidden small:inline-flex">View All</LocalizedClientLink></div><div className="mt-10 grid grid-cols-2 gap-x-4 gap-y-12 small:grid-cols-4 small:gap-x-7">{[...products, ...products].map((product, index) => <ProductCard key={`${product[0]}-${index}`} product={product} compact />)}</div><div className="mt-10 text-center small:hidden"><LocalizedClientLink href="/store" className="figma-button">View All</LocalizedClientLink></div></section>

    <section className="figma-container py-16 small:py-24"><SectionTitle eyebrow="Featured" title="New Arrival" /><div className="mt-10 grid grid-cols-1 gap-4 small:grid-cols-2">{[["PlayStation 5", "Black and White version of the PS5 coming out on sale.", "/figma/home/jbl.png"], ["Women’s Collections", "Featured woman collections that give you another vibe.", "/figma/home/hero.png"], ["Speakers", "Amazon wireless speakers", "/figma/home/cooler.png"], ["Perfume", "GUCCI INTENSE OUD EDP", "/figma/home/gucci-bag.png"]].map(([title, copy, image], index) => <article key={title} className={`relative min-h-[280px] overflow-hidden rounded-control bg-[#1d1d1d] p-8 text-white ${index === 0 ? "small:row-span-2 small:min-h-[600px]" : ""}`}><img src={image} alt="" className="absolute inset-0 h-full w-full object-contain opacity-60" /><div className="relative z-10 flex h-full max-w-xs flex-col justify-end"><h3 className="text-xl font-semibold">{title}</h3><p className="mt-2 text-sm text-white/75">{copy}</p><LocalizedClientLink href="/store" className="mt-4 inline-flex w-fit border-b border-white pb-1 text-sm">Shop Now</LocalizedClientLink></div></article>)}</div></section>

    <section className="figma-container py-16 small:py-24"><div className="flex items-end justify-between"><SectionTitle eyebrow="Live Marketplace" title="Latest from sellers" /><LocalizedClientLink href="/store" className="figma-button hidden small:inline-flex">Shop all</LocalizedClientLink></div><div className="mt-10"><PaginatedProducts sortBy="created_at" page={page} countryCode={countryCode} /></div></section>
  </div>
}

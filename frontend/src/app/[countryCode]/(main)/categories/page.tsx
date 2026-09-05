import { Metadata } from "next"

import { listCategories } from "@lib/data/categories"
import LocalizedClientLink from "@modules/common/components/localized-client-link"

export const dynamic = "force-dynamic"

export const metadata: Metadata = {
  title: "Shop by category | How’s U",
  description: "Browse products by category on How’s U.",
}

const CURATED_CATEGORIES = [
  { id: "fashion-women", name: "Women's Fashion", description: "Dresses, tops, shoes, bags & more.", href: "/store?q=fashion" },
  { id: "fashion-men", name: "Men's Fashion", description: "Shirts, trousers, watches & more.", href: "/store?q=men" },
  { id: "electronics", name: "Electronics", description: "Phones, computers, audio & cameras.", href: "/store?q=electronics" },
  { id: "home", name: "Home & Lifestyle", description: "Furniture, kitchen, decor & appliances.", href: "/store?q=home" },
  { id: "beauty", name: "Health & Beauty", description: "Skincare, haircare, makeup & grooming.", href: "/store?q=beauty" },
  { id: "sports", name: "Sports & Outdoor", description: "Fitness, team sports & outdoor gear.", href: "/store?q=sports" },
  { id: "baby", name: "Baby & Toys", description: "Baby clothing, toys & games.", href: "/store?q=toys" },
  { id: "groceries", name: "Groceries & Pets", description: "Pantry, fresh food & pet care.", href: "/store?q=grocery" },
  { id: "wellness", name: "Wellness", description: "First aid, wellness & personal care.", href: "/store?q=wellness" },
]

export default async function CategoriesPage() {
  const categories = await listCategories().catch(() => [])
  const backendCategories = categories.filter((category) => !category.parent_category)
  // Backend category taxonomy is optional. When stores haven't set one up,
  // show curated aisles that search the marketplace instead of a dead end.
  const tiles = backendCategories.length
    ? backendCategories.map((c) => ({
        id: c.id,
        name: c.name,
        description: c.description ?? "",
        href: `/categories/${c.handle}`,
      }))
    : CURATED_CATEGORIES

  return (
    <div className="figma-container py-10 small:py-16">
      <div className="mb-8 max-w-xl">
        <p className="mb-2 text-xs font-medium uppercase tracking-[0.16em] text-ink-muted">
          Browse
        </p>
        <h1 className="font-display text-3xl font-medium tracking-[-0.02em] text-ink small:text-4xl">
          Shop by category
        </h1>
        <p className="mt-3 text-base-regular text-ui-fg-subtle">
          Find something you love from independent stores.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3 small:grid-cols-2 medium:grid-cols-3">
        {tiles.map((category) => (
          <LocalizedClientLink
            key={category.id}
            href={category.href}
            className="group rounded-control border border-ink-hairline bg-white/70 p-5 shadow-sm backdrop-blur transition-colors hover:border-ink/30 hover:bg-white"
          >
            <span className="flex items-center justify-between gap-4 text-base font-medium text-ink">
              {category.name}
              <span aria-hidden className="text-ink-muted transition-transform group-hover:translate-x-1">
                →
              </span>
            </span>
            {category.description && (
              <span className="mt-2 block text-sm text-ui-fg-subtle">
                {category.description}
              </span>
            )}
          </LocalizedClientLink>
        ))}
      </div>
    </div>
  )
}

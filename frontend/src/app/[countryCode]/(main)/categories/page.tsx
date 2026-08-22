import { Metadata } from "next"

import { listCategories } from "@lib/data/categories"
import LocalizedClientLink from "@modules/common/components/localized-client-link"

export const dynamic = "force-dynamic"

export const metadata: Metadata = {
  title: "Shop by category | How’s U",
  description: "Browse products by category on How’s U.",
}

export default async function CategoriesPage() {
  const categories = await listCategories().catch(() => [])
  const rootCategories = categories.filter((category) => !category.parent_category)

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

      {rootCategories.length ? (
        <div className="grid grid-cols-1 gap-3 small:grid-cols-2 medium:grid-cols-3">
          {rootCategories.map((category) => (
            <LocalizedClientLink
              key={category.id}
              href={`/categories/${category.handle}`}
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
      ) : (
        <div className="rounded-control border border-ink-hairline bg-white/70 px-5 py-10 text-center shadow-sm backdrop-blur">
          <p className="text-base font-medium text-ink">Categories are coming soon.</p>
          <p className="mt-2 text-sm text-ui-fg-subtle">
            Browse the marketplace to see what stores have available now.
          </p>
          <LocalizedClientLink
            href="/store"
            className="mt-5 inline-flex rounded-control bg-ink px-5 py-3 text-sm font-medium text-white transition-opacity hover:opacity-85"
          >
            Browse the marketplace
          </LocalizedClientLink>
        </div>
      )}
    </div>
  )
}

export const FLASH_SALE_DURATION_MS = 3 * 24 * 60 * 60 * 1000

// Homepage banners auto-expire like a status post: 72h after being switched
// on, the storefront stops featuring them — no manual clearing, and every
// new banner gets its own window.
export const HOMEPAGE_BANNER_TTL_MS = 72 * 60 * 60 * 1000

export function homepageBannerStartedAt(
  metadata: Record<string, unknown> | null | undefined,
  fallbackStart?: string | null
): number | null {
  const meta = (metadata ?? {}) as Record<string, unknown>
  if (meta.homepage_banner !== true) return null
  const since =
    typeof meta.homepage_banner_at === "string"
      ? Date.parse(meta.homepage_banner_at)
      : NaN
  if (Number.isFinite(since)) return since
  // Grandfathered banners (flagged before timestamps existed) start their
  // 72h window at the product's last update instead of vanishing instantly.
  const fallback = fallbackStart ? Date.parse(fallbackStart) : NaN
  return Number.isFinite(fallback) ? fallback : null
}

export function isHomepageBannerLive(
  metadata: Record<string, unknown> | null | undefined,
  fallbackStart?: string | null,
  now = Date.now()
): boolean {
  const startedAt = homepageBannerStartedAt(metadata, fallbackStart)
  return startedAt !== null && now - startedAt < HOMEPAGE_BANNER_TTL_MS
}

// A stable epoch keeps the cycle predictable across server restarts. Products
// added with flash-sale enabled are assigned to the current cycle.
export const FLASH_SALE_EPOCH_MS = Date.UTC(2026, 0, 1)

export const getFlashSaleCycle = (now = Date.now()) => {
  const cycle = Math.max(0, Math.floor((now - FLASH_SALE_EPOCH_MS) / FLASH_SALE_DURATION_MS))
  const startsAt = FLASH_SALE_EPOCH_MS + cycle * FLASH_SALE_DURATION_MS

  return {
    id: cycle,
    startsAt,
    endsAt: startsAt + FLASH_SALE_DURATION_MS,
  }
}

export const applyPromotionMetadata = (
  current: Record<string, unknown> = {},
  options: {
    flashSale?: boolean
    homepageBanner?: boolean
    homepageBannerImage?: string | null
  },
  now = Date.now()
) => {
  const metadata = { ...current }

  if (options.flashSale !== undefined) {
    metadata.flash_sale = options.flashSale
    if (options.flashSale) {
      const cycle = getFlashSaleCycle(now)
      metadata.flash_sale_cycle = cycle.id
      metadata.flash_sale_starts_at = new Date(cycle.startsAt).toISOString()
      metadata.flash_sale_ends_at = new Date(cycle.endsAt).toISOString()
    } else {
      delete metadata.flash_sale_cycle
      delete metadata.flash_sale_starts_at
      delete metadata.flash_sale_ends_at
    }
  }

  if (options.homepageBanner !== undefined) {
    const wasOn = current.homepage_banner === true
    metadata.homepage_banner = options.homepageBanner
    if (options.homepageBanner && !wasOn) {
      // Fresh 72h window starts the moment the banner is switched on.
      // Unrelated edits while it stays on must NOT extend it.
      metadata.homepage_banner_at = new Date(now).toISOString()
    } else if (!options.homepageBanner) {
      delete metadata.homepage_banner_at
    }
  }

  if (options.homepageBannerImage !== undefined) {
    if (options.homepageBannerImage) {
      metadata.homepage_banner_image = options.homepageBannerImage
      metadata.homepage_banner = true
    } else {
      delete metadata.homepage_banner_image
    }
  }

  return metadata
}

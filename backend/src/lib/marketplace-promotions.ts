export const FLASH_SALE_DURATION_MS = 3 * 24 * 60 * 60 * 1000

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
    metadata.homepage_banner = options.homepageBanner
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

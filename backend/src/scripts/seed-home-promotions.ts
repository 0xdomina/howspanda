import { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { getFlashSaleCycle } from "../lib/marketplace-promotions"

const BANNER_HANDLES = [
  "afterhours-boxy-tee",
  "pocket-anc-headphones",
  "maji-glass-table-lamp",
  "dew-club-daily-spf-50",
  "sunday-cotton-throw",
]

const FLASH_HANDLES = [
  "afterhours-boxy-tee",
  "pocket-anc-headphones",
  "maji-glass-table-lamp",
  "dew-club-daily-spf-50",
  "creator-clip-light",
  "sunday-cotton-throw",
]

export default async function seedHomePromotions({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const productModule = container.resolve(Modules.PRODUCT)
  const products = await productModule.listProducts({
    handle: [...new Set([...BANNER_HANDLES, ...FLASH_HANDLES])],
  })
  const cycle = getFlashSaleCycle()
  let updated = 0

  for (const product of products as any[]) {
    const metadata = { ...((product.metadata ?? {}) as Record<string, unknown>) }
    const isBanner = BANNER_HANDLES.includes(product.handle)
    const isFlash = FLASH_HANDLES.includes(product.handle)

    await productModule.updateProducts(
      { id: product.id },
      {
        metadata: {
          ...metadata,
          homepage_banner: isBanner,
          flash_sale: isFlash,
          ...(isFlash
            ? {
                flash_sale_cycle: cycle.id,
                flash_sale_starts_at: new Date(cycle.startsAt).toISOString(),
                flash_sale_ends_at: new Date(cycle.endsAt).toISOString(),
              }
            : {}),
        },
      }
    )
    updated += 1
  }

  logger.info(`Home promotions ready: ${updated} products updated for cycle ${cycle.id}.`)
}

import { MedusaError, MedusaService } from "@medusajs/framework/utils"
import WishlistItem from "./models/wishlist-item"

export type WishlistItemInput = {
  id: string
  handle?: string
  title: string
  thumbnail?: string | null
  price?: string
}

class WishlistModuleService extends MedusaService({ WishlistItem }) {
  async getCustomerWishlist(customerId: string) {
    if (!customerId) {
      throw new MedusaError(MedusaError.Types.UNAUTHORIZED, "Sign in to view your wishlist")
    }

    return this.listWishlistItems(
      { customer_id: customerId },
      { order: { created_at: "DESC" } }
    )
  }

  async replaceCustomerWishlist(customerId: string, input: WishlistItemInput[]) {
    if (!customerId) {
      throw new MedusaError(MedusaError.Types.UNAUTHORIZED, "Sign in to save your wishlist")
    }
    if (input.length > 100) {
      throw new MedusaError(MedusaError.Types.INVALID_DATA, "A wishlist can contain at most 100 items")
    }

    const deduped = Array.from(new Map(input.map((item) => [item.id, item])).values())
    const existing = await this.listWishlistItems({ customer_id: customerId }, { take: null })
    const incomingIds = new Set(deduped.map((item) => item.id))
    const removed = existing.filter((item) => !incomingIds.has(item.item_id))
    if (removed.length) {
      await this.deleteWishlistItems(removed.map((item) => item.id))
    }

    const existingByItem = new Map(existing.map((item) => [item.item_id, item]))
    const updates = deduped
      .map((item) => {
        const row = existingByItem.get(item.id)
        return row
          ? {
              id: row.id,
              handle: item.handle ?? null,
              title: item.title,
              thumbnail: item.thumbnail ?? null,
              price: item.price ?? null,
            }
          : null
      })
      .filter(Boolean) as Array<Record<string, unknown>>
    if (updates.length) {
      await this.updateWishlistItems(updates)
    }

    const creates = deduped.filter((item) => !existingByItem.has(item.id))
    if (creates.length) {
      await this.createWishlistItems(
        creates.map((item) => ({
          customer_id: customerId,
          item_id: item.id,
          handle: item.handle ?? null,
          title: item.title,
          thumbnail: item.thumbnail ?? null,
          price: item.price ?? null,
        }))
      )
    }

    return this.getCustomerWishlist(customerId)
  }
}

export default WishlistModuleService

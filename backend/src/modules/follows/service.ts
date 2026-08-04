import { MedusaError, MedusaService } from "@medusajs/framework/utils"
import StoreFollow from "./models/store-follow"
import StoreBroadcast, { BroadcastType } from "./models/store-broadcast"
import AppNotification from "./models/app-notification"
import GiveawayClaim from "./models/giveaway-claim"
import { findContactLeak } from "../../lib/follows/privacy"

// Rolling weekly quota for broadcasts per store (env-overridable, default 3).
const BROADCASTS_PER_WEEK = Number(process.env.BROADCASTS_PER_WEEK ?? 3)

export type CreateBroadcastInput = {
  seller_id: string
  actor_label: string
  actor_handle: string
  type: BroadcastType
  title: string
  body: string
  product_id?: string | null
  voucher_code?: string | null
  discount_type?: "fixed" | "percent" | null
  discount_value?: number | null
}

class FollowsModuleService extends MedusaService({
  StoreFollow,
  StoreBroadcast,
  AppNotification,
  GiveawayClaim,
}) {
  // ── following ──────────────────────────────────────────────────────────

  async followerCount(sellerId: string): Promise<number> {
    const rows = await this.listStoreFollows(
      { seller_id: sellerId },
      { select: ["id"] }
    )
    return rows.length
  }

  async isFollowing(sellerId: string, customerId: string): Promise<boolean> {
    if (!customerId) return false
    const rows = await this.listStoreFollows(
      { seller_id: sellerId, customer_id: customerId },
      { take: 1 }
    )
    return rows.length > 0
  }

  async follow(sellerId: string, customerId: string): Promise<void> {
    const existing = await this.listStoreFollows(
      { seller_id: sellerId, customer_id: customerId },
      { take: 1 }
    )
    if (!existing.length) {
      await this.createStoreFollows({ seller_id: sellerId, customer_id: customerId })
    }
  }

  async unfollow(sellerId: string, customerId: string): Promise<void> {
    const rows = await this.listStoreFollows(
      { seller_id: sellerId, customer_id: customerId },
      { select: ["id"] }
    )
    if (rows.length) {
      await this.deleteStoreFollows(rows.map((r) => r.id))
    }
  }

  // ── broadcasts ─────────────────────────────────────────────────────────

  async broadcastsRemainingThisWeek(sellerId: string): Promise<number> {
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
    const rows = await this.listStoreBroadcasts(
      { seller_id: sellerId, created_at: { $gte: weekAgo } },
      { select: ["id"] }
    )
    return Math.max(0, BROADCASTS_PER_WEEK - rows.length)
  }

  /** Validates quota + privacy, persists the broadcast, and fans out one
   *  notification per follower. Never leaks who the followers are. */
  async createBroadcast(input: CreateBroadcastInput) {
    const remaining = await this.broadcastsRemainingThisWeek(input.seller_id)
    if (remaining <= 0) {
      throw new MedusaError(
        MedusaError.Types.NOT_ALLOWED,
        `Weekly broadcast limit reached (max ${BROADCASTS_PER_WEEK}/week)`
      )
    }
    for (const [part, text] of [
      ["title", input.title],
      ["body", input.body],
    ] as const) {
      const leak = findContactLeak(text)
      if (leak) {
        throw new MedusaError(
          MedusaError.Types.INVALID_DATA,
          `Broadcast ${part} can't contain a ${leak.kind} — keep contact on-platform`
        )
      }
    }

    const broadcast = await this.createStoreBroadcasts({
      seller_id: input.seller_id,
      type: input.type,
      title: input.title,
      body: input.body,
      product_id: input.product_id ?? null,
      voucher_code: input.voucher_code ?? null,
      discount_type: input.discount_type ?? null,
      discount_value: input.discount_value ?? null,
      giveaway_claims_count: 0,
    })

    const followers = await this.listStoreFollows(
      { seller_id: input.seller_id },
      { select: ["customer_id"] }
    )
    if (followers.length) {
      const rows = followers.map((f) => ({
        customer_id: f.customer_id,
        kind: "store_broadcast" as const,
        broadcast_id: broadcast.id,
        seller_id: input.seller_id,
        actor_label: input.actor_label,
        actor_handle: input.actor_handle,
        title: input.title,
        body: input.body,
        payload: {
          type: input.type,
          product_id: input.product_id ?? null,
          voucher_code: input.voucher_code ?? null,
          discount_type: input.discount_type ?? null,
          discount_value: input.discount_value ?? null,
        },
        read_at: null,
      }))
      await this.createAppNotifications(rows)
    }

    return { broadcast, delivered: followers.length, remaining }
  }

  /** Seller's broadcasts plus per-post delivery/read stats and quota left. */
  async listBroadcasts(sellerId: string) {
    const broadcasts = await this.listStoreBroadcasts(
      { seller_id: sellerId },
      { order: { created_at: "DESC" } }
    )
    const remaining = await this.broadcastsRemainingThisWeek(sellerId)

    const ids = broadcasts.map((b) => b.id)
    const notifications = ids.length
      ? await this.listAppNotifications({ broadcast_id: { $in: ids } }, { select: ["id", "broadcast_id", "read_at"] })
      : []
    const byId = new Map<string, { delivered: number; read: number }>()
    for (const n of notifications) {
      const rec = byId.get(n.broadcast_id!) ?? { delivered: 0, read: 0 }
      rec.delivered += 1
      if (n.read_at) rec.read += 1
      byId.set(n.broadcast_id!, rec)
    }

    const rows = broadcasts.map((b) => {
      const stats = byId.get(b.id) ?? { delivered: 0, read: 0 }
      return { ...b, delivered: stats.delivered, read_count: stats.read }
    })
    return { broadcasts: rows, remaining_this_week: remaining }
  }

  // ── notifications ──────────────────────────────────────────────────────

  async listNotifications(customerId: string) {
    const all = await this.listAppNotifications(
      { customer_id: customerId },
      { order: { created_at: "DESC" } }
    )
    const unread_count = all.filter((n) => !n.read_at).length
    return { notifications: all, unread_count }
  }

  /** Marks rows owned by the customer as read. Count of rows actually updated. */
  async markNotificationsRead(customerId: string, ids: string[]) {
    const owned = await this.listAppNotifications(
      { id: { $in: ids }, customer_id: customerId },
      { select: ["id"] }
    )
    if (owned.length) {
      await this.updateAppNotifications(
        owned.map((n) => ({ id: n.id, read_at: new Date() }))
      )
    }
    return owned.length
  }

  // ── giveaway claims ────────────────────────────────────────────────────

  async claimGiveaway(broadcastId: string, customerId: string) {
    const [broadcast] = await this.listStoreBroadcasts(
      { id: broadcastId, type: "giveaway" },
      { take: 1 }
    )
    if (!broadcast) {
      throw new MedusaError(MedusaError.Types.NOT_FOUND, "Giveaway not found")
    }
    // The fan-out guarantees a notification row exists for followers only.
    const [notif] = await this.listAppNotifications(
      { broadcast_id: broadcastId, customer_id: customerId },
      { take: 1 }
    )
    if (!notif) {
      throw new MedusaError(
        MedusaError.Types.NOT_ALLOWED,
        "Only followers can claim this giveaway"
      )
    }

    const [existing] = await this.listGiveawayClaims(
      { broadcast_id: broadcastId, customer_id: customerId },
      { take: 1 }
    )
    if (existing) {
      return { claimed: true, already: true }
    }
    await this.createGiveawayClaims({
      broadcast_id: broadcastId,
      customer_id: customerId,
    })
    await this.updateStoreBroadcasts({
      id: broadcastId,
      giveaway_claims_count: (broadcast.giveaway_claims_count ?? 0) + 1,
    })
    return { claimed: true, already: false }
  }
}

export default FollowsModuleService
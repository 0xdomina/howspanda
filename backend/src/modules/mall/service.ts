import { MedusaError, MedusaService } from "@medusajs/framework/utils"
import Mall from "./models/mall"
import MallSeller from "./models/mall-seller"
import MallBuyer from "./models/mall-buyer"
import MallPrize from "./models/mall-prize"
import MallPurchase from "./models/mall-purchase"

const DEFAULT_TARGET_SELLERS = 5
const DEFAULT_TARGET_BUYERS = 10
const MAX_MALL_DURATION_DAYS = 30

// Locked economics: 20% platform tax on every seller contribution to the prize
// pool (₦100 pledged → ₦20 platform → ₦80 pool). The pool is displayed NET so
// buyers and sellers always see the real pot. The gross pledge is kept in
// `contributed_ngn` as the refund basis: a mall that never launches returns the
// FULL gross amount (the platform absorbs its share); a mall that launched
// refunds only its remaining net pool pro-rata after cancellation.
const PLATFORM_TAX = 0.2

// Net pool contribution after the platform tax (gross pledge × 0.8).
const netOfTax = (gross: number) =>
  Math.floor(gross * (1 - PLATFORM_TAX))

export type CreateMallInput = {
  name: string
  description?: string
  createdBySellerId: string
  targetSellers?: number
  targetBuyers?: number
  prizeWinnerCount: number
  prizeDistribution: "equal" | "random"
  prizePoolNgn: number
  productIds?: string[]
  durationDays?: number
}

export type JoinAsSellerInput = {
  mallId: string
  sellerId: string
  contributionNgn: number
  productIds?: string[]
  redeemableId?: string
}

export type JoinAsBuyerInput = {
  mallId: string
  buyerEmail: string
}

export type RecordPurchaseInput = {
  mallId: string
  buyerEmail: string
  orderId: string
}

class MallModuleService extends MedusaService({
  Mall,
  MallSeller,
  MallBuyer,
  MallPrize,
  MallPurchase,
}) {
  async createMall(input: CreateMallInput) {
    if (input.prizePoolNgn <= 0) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "Prize pool must be positive"
      )
    }
    const now = new Date()
    const durationDays = Math.min(
      input.durationDays ?? 7,
      MAX_MALL_DURATION_DAYS
    )
    const expiresAt = new Date(
      now.getTime() + durationDays * 24 * 60 * 60 * 1000
    )
    // 20% platform tax: the pledge is the gross contribution, the pool the net.
    const netPool = netOfTax(input.prizePoolNgn)
    const created = await this.createMalls({
      name: input.name,
      description: input.description ?? null,
      created_by_seller_id: input.createdBySellerId,
      status: "pending",
      target_sellers: input.targetSellers ?? DEFAULT_TARGET_SELLERS,
      target_buyers: input.targetBuyers ?? DEFAULT_TARGET_BUYERS,
      prize_winner_count: input.prizeWinnerCount,
      prize_distribution: input.prizeDistribution,
      prize_pool_ngn: netPool,
      contributed_ngn: input.prizePoolNgn,
      remaining_ngn: netPool,
      expires_at: expiresAt,
    })
    await this.createMallSellers({
      mall: created.id,
      seller_id: input.createdBySellerId,
      contribution_ngn: input.prizePoolNgn,
      product_ids: input.productIds?.length ? { ids: input.productIds } : null,
      contribution_ledger_id: null,
      joined_at: new Date(),
    })
    return created
  }

  async listForSeller(sellerId: string) {
    const joined = await this.listMallSellers(
      { seller_id: sellerId },
      { take: 1000 }
    )
    const created = await this.listMalls(
      { created_by_seller_id: sellerId },
      { take: 1000 }
    )
    const createdIds = new Set(created.map((m) => m.id))
    const joinedMallIds = new Set(joined.map((s) => s.mall_id))
    const allIds = new Set([...createdIds, ...joinedMallIds])
    if (!allIds.size) return []
    return await this.listMalls(
      { id: [...allIds] },
      { order: { created_at: "DESC" } }
    )
  }

  private decorateMall(mall: any) {
    const sellers = Array.isArray(mall.sellers) ? mall.sellers : []
    const buyers = Array.isArray(mall.buyers) ? mall.buyers : []
    const prizes = Array.isArray(mall.prizes) ? mall.prizes : []
    const paidOut = prizes
      .filter((prize: any) => prize.claimed || prize.wallet_ledger_id)
      .reduce((sum: number, prize: any) => sum + Number(prize.amount_ngn ?? 0), 0)

    return {
      ...mall,
      seller_count: sellers.length,
      buyer_count: buyers.length,
      winner_count: prizes.length,
      paid_out_ngn: paidOut,
      shopping_open: mall.status === "active",
    }
  }

  async listPublic() {
    const [pending, active] = await Promise.all([
      this.listMalls(
        { status: "pending" },
        { relations: ["sellers", "buyers", "prizes"], order: { created_at: "DESC" } }
      ),
      this.listMalls(
        { status: "active" },
        { relations: ["sellers", "buyers", "prizes"], order: { created_at: "DESC" } }
      ),
    ])
    return [...pending, ...active]
      .map((mall) => this.decorateMall(mall))
      .sort((a, b) => Number(b.prize_pool_ngn) - Number(a.prize_pool_ngn))
  }

  async listActive() {
    return await this.listPublic()
  }

  async getDetails(mallId: string) {
    const mall = await this.listMalls(
      { id: mallId },
      {
        take: 1,
        relations: ["sellers", "buyers", "prizes"],
      }
    )
    if (!mall.length) {
      throw new MedusaError(
        MedusaError.Types.NOT_FOUND,
        "Mall not found"
      )
    }
    return this.decorateMall(mall[0])
  }

  async joinAsSeller(input: JoinAsSellerInput) {
    const mall = await this.listMalls(
      { id: input.mallId },
      { take: 1 }
    )
    if (!mall.length) {
      throw new MedusaError(
        MedusaError.Types.NOT_FOUND,
        "Mall not found"
      )
    }
    if (mall[0].status !== "pending") {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "Mall is not accepting new sellers"
      )
    }
    const existing = await this.listMallSellers({
      mall_id: input.mallId,
      seller_id: input.sellerId,
    })
    if (existing.length > 0) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "Seller has already joined this mall"
      )
    }
    const sellerJoin = await this.createMallSellers({
      mall_id: input.mallId,
      seller_id: input.sellerId,
      contribution_ngn: input.contributionNgn,
      product_ids: input.productIds?.length ? { ids: input.productIds } : null,
      contribution_ledger_id: null,
      redeemable_id: input.redeemableId ?? null,
      joined_at: new Date(),
    })
    const newContributed = mall[0].contributed_ngn + input.contributionNgn
    // Only the NET pledge (80%) enters the pool; the gross stays on the
    // contribution record as the refund basis.
    const netContribution = netOfTax(input.contributionNgn)
    const newRemaining = mall[0].remaining_ngn + netContribution
    await this.updateMalls({
      id: input.mallId,
      contributed_ngn: newContributed,
      remaining_ngn: newRemaining,
      prize_pool_ngn: mall[0].prize_pool_ngn + netContribution,
    })
    await this.checkThresholds(input.mallId)
    return sellerJoin
  }

  async setContributionLedger(
    mallId: string,
    sellerId: string,
    ledgerId: string
  ) {
    const [sellerJoin] = await this.listMallSellers({
      mall_id: mallId,
      seller_id: sellerId,
    })
    if (!sellerJoin) return null
    return await this.updateMallSellers({
      id: sellerJoin.id,
      contribution_ledger_id: ledgerId,
    })
  }

  async joinAsBuyer(input: JoinAsBuyerInput) {
    const mall = await this.listMalls(
      { id: input.mallId },
      { take: 1 }
    )
    if (!mall.length) {
      throw new MedusaError(
        MedusaError.Types.NOT_FOUND,
        "Mall not found"
      )
    }
    if (mall[0].status !== "pending" && mall[0].status !== "active") {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "Mall is not accepting new buyers"
      )
    }
    const existing = await this.listMallBuyers({
      mall_id: input.mallId,
      buyer_email: input.buyerEmail,
    })
    if (existing.length > 0) {
      return existing[0]
    }
    const buyerJoin = await this.createMallBuyers({
      mall_id: input.mallId,
      buyer_email: input.buyerEmail,
      joined_at: new Date(),
    })
    await this.checkThresholds(input.mallId)
    return buyerJoin
  }

  async checkThresholds(mallId: string) {
    const mall = await this.listMalls(
      { id: mallId },
      { take: 1 }
    )
    if (!mall.length || mall[0].status !== "pending") {
      return false
    }
    const sellerCount = await this.listMallSellers({
      mall_id: mallId,
    }).then((s) => s.length)
    const buyerCount = await this.listMallBuyers({
      mall_id: mallId,
    }).then((b) => b.length)
    if (
      sellerCount >= mall[0].target_sellers &&
      buyerCount >= mall[0].target_buyers
    ) {
      await this.activate(mallId)
      return true
    }
    return false
  }

  async activate(mallId: string) {
    const mall = await this.listMalls(
      { id: mallId },
      { take: 1 }
    )
    if (!mall.length) {
      throw new MedusaError(
        MedusaError.Types.NOT_FOUND,
        "Mall not found"
      )
    }
    if (mall[0].status !== "pending") {
      return mall[0]
    }
    const updated = await this.updateMalls({
      id: mallId,
      status: "active",
      starts_at: new Date(),
    })
    return updated
  }

  async recordPurchase(input: RecordPurchaseInput) {
    const mall = await this.listMalls(
      { id: input.mallId },
      { take: 1 }
    )
    if (!mall.length) {
      throw new MedusaError(
        MedusaError.Types.NOT_FOUND,
        "Mall not found"
      )
    }
    if (mall[0].status !== "active") {
      return null
    }
    // Replay guard: one lottery ticket per (mall, order). A repeated call with
    // the same order is a no-op — otherwise a buyer could re-roll the same
    // purchase until a win landed, draining the pool with one real order.
    const [already] = await this.listMallPurchases({
      mall_id: input.mallId,
      order_id: input.orderId,
    })
    if (already) {
      return null
    }
    try {
      await this.createMallPurchases({
        mall_id: input.mallId,
        order_id: input.orderId,
        buyer_email: input.buyerEmail,
      })
    } catch {
      // Concurrent replay hit the (mall_id, order_id) unique index — the other
      // request already recorded this purchase.
      return null
    }
    let buyer = await this.listMallBuyers({
      mall_id: input.mallId,
      buyer_email: input.buyerEmail,
    }).then((b) => b[0])
    if (!buyer) {
      buyer = await this.createMallBuyers({
        mall_id: input.mallId,
        buyer_email: input.buyerEmail,
        joined_at: new Date(),
        purchase_count: 1,
      })
    } else {
      await this.updateMallBuyers({
        id: buyer.id,
        purchase_count: buyer.purchase_count + 1,
      })
    }
    if (buyer.has_won) {
      return null
    }
    const prizesDrawn = await this.listMallPrizes({
      mall_id: input.mallId,
    }).then((p) => p.length)
    if (prizesDrawn >= mall[0].prize_winner_count) {
      return null
    }
    const remaining = mall[0].prize_winner_count - prizesDrawn
    const winChance = remaining / mall[0].target_buyers
    const randomValue = Math.random()
    const won = randomValue < winChance
    if (!won) {
      return null
    }
    const remainingPool = mall[0].remaining_ngn
    let prizeAmount: number
    if (mall[0].prize_distribution === "equal") {
      prizeAmount = Math.floor(remainingPool / remaining)
    } else {
      const maxPrize = Math.min(
        Math.floor(remainingPool / remaining),
        50000
      )
      prizeAmount = Math.floor(Math.random() * maxPrize) + 1000
    }
    if (prizeAmount <= 0) {
      return null
    }

    // Create prize record (wallet credit will be handled by the route layer)
    const prize = await this.createMallPrizes({
      mall_id: input.mallId,
      winner_buyer_email: input.buyerEmail,
      amount_ngn: prizeAmount,
      is_random: true,
      random_seed: randomValue.toString(),
      wallet_ledger_id: null, // Will be set after wallet credit
      claimed: false,
    })
    await this.updateMallBuyers({
      id: buyer.id,
      has_won: true,
      won_prize_ngn: prizeAmount,
      won_at: new Date(),
    })
    const newRemaining = mall[0].remaining_ngn - prizeAmount
    await this.updateMalls({
      id: input.mallId,
      remaining_ngn: newRemaining,
    })
    const newPrizesDrawn = await this.listMallPrizes({
      mall_id: input.mallId,
    }).then((p) => p.length)
    if (newPrizesDrawn >= mall[0].prize_winner_count) {
      await this.updateMalls({
        id: input.mallId,
        status: "settling",
      })
    }
    return {
      won: true,
      prizeAmount,
      redeemableId: prize.redeemable_id,
    }
  }

  // Time's up. No money moves here: the author decides next — re-launch
  // (instant live, sellers/buyers preserved) or cancel (refund per the
  // never-launched / launched rules below).
  async expire(mallId: string) {
    const mall = await this.listMalls(
      { id: mallId },
      { take: 1 }
    )
    if (!mall.length) {
      throw new MedusaError(
        MedusaError.Types.NOT_FOUND,
        "Mall not found"
      )
    }
    if (
      mall[0].status === "closed" ||
      mall[0].status === "cancelled" ||
      mall[0].status === "expired"
    ) {
      return mall[0]
    }
    const updated = await this.updateMalls({
      id: mallId,
      status: "expired",
      ends_at: new Date(),
    })
    return updated
  }

  // Re-launch an expired mall: straight to live, same sellers and buyers, with
  // a fresh clock. Nothing is refunded — the pool (net) carries over.
  async relaunch(mallId: string, durationDays?: number) {
    const mall = await this.listMalls(
      { id: mallId },
      { take: 1 }
    )
    if (!mall.length) {
      throw new MedusaError(
        MedusaError.Types.NOT_FOUND,
        "Mall not found"
      )
    }
    if (mall[0].status !== "expired") {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "Only expired malls can be re-launched"
      )
    }
    const now = new Date()
    const days = Math.min(durationDays ?? 7, MAX_MALL_DURATION_DAYS)
    const expiresAt = new Date(
      now.getTime() + days * 24 * 60 * 60 * 1000
    )
    return await this.updateMalls({
      id: mallId,
      status: "active",
      starts_at: now,
      ends_at: null,
      expires_at: expiresAt,
    })
  }

  async cancel(mallId: string) {
    const mall = await this.listMalls(
      { id: mallId },
      { take: 1 }
    )
    if (!mall.length) {
      throw new MedusaError(
        MedusaError.Types.NOT_FOUND,
        "Mall not found"
      )
    }
    if (
      mall[0].status !== "pending" &&
      mall[0].status !== "expired"
    ) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "Only pending or expired malls can be cancelled"
      )
    }
    let refunds: { seller_id: string; amount: number }[] = []
    if (mall[0].contributed_ngn > 0) {
      // Never launched → full gross refunds (platform absorbs the 20%).
      // Launched → opaque pro-rata refunds of the remaining net pool.
      refunds = await this.refund(mallId, { full: !mall[0].starts_at })
    }
    const updated = await this.updateMalls({
      id: mallId,
      status: "cancelled",
    })
    return { mall: updated, refunds }
  }

  // Computes the per-seller refund owed when a mall is wound down. Returns the
  // breakdown (route layer wires each amount through the marketplace ledger so
  // it lands on the seller's payout balance) and zeroes the pool.
  private async refund(
    mallId: string,
    opts?: { full?: boolean }
  ): Promise<{ seller_id: string; amount: number }[]> {
    const mall = await this.listMalls(
      { id: mallId },
      { take: 1 }
    )
    if (!mall.length) return []
    const sellers = await this.listMallSellers({
      mall_id: mallId,
    })
    const joinTotal = sellers.reduce(
      (sum, s) => sum + s.contribution_ngn,
      0
    )
    const totalContributed = Number(mall[0].contributed_ngn)
    if (totalContributed === 0) return []

    // Every party with money in the pool: the joined sellers plus the author's
    // opening pledge (which has no MallSeller row of its own).
    const parties: { seller_id: string; contribution: number }[] = []
    for (const seller of sellers) {
      parties.push({
        seller_id: seller.seller_id,
        contribution: Number(seller.contribution_ngn),
      })
    }
    const authorPledge = Math.max(0, totalContributed - joinTotal)
    if (authorPledge > 0) {
      parties.push({
        seller_id: mall[0].created_by_seller_id,
        contribution: authorPledge,
      })
    }

    const refunds: { seller_id: string; amount: number }[] = []
    if (opts?.full) {
      // Mall never launched: every party gets their full gross pledge back.
      for (const party of parties) {
        if (party.contribution <= 0) continue
        refunds.push({
          seller_id: party.seller_id,
          amount: Math.floor(party.contribution),
        })
        console.log(
          `[mall] Full refund of ₦${party.contribution} to seller ` +
          `${party.seller_id} (mall never launched)`
        )
      }
      await this.updateMalls({
        id: mallId,
        remaining_ngn: 0,
        prize_pool_ngn: 0,
      })
      return refunds
    }

    // Mall launched then cancelled: the remaining NET pool is split pro-rata
    // by gross contribution share. Deliberately not itemized to sellers — the
    // platform's 20% is folded into the share.
    const remainingPool = Number(mall[0].remaining_ngn)
    for (const party of parties) {
      const share = party.contribution / totalContributed
      const refundAmount = Math.floor(remainingPool * share)
      if (refundAmount <= 0) continue
      refunds.push({ seller_id: party.seller_id, amount: refundAmount })
      console.log(
        `[mall] Pro-rata refund of ₦${refundAmount} to seller ${party.seller_id} ` +
        `(share: ${(share * 100).toFixed(2)}%)`
      )
    }
    await this.updateMalls({
      id: mallId,
      remaining_ngn: 0,
    })
    return refunds
  }

  // Newest prize wins across all malls, with the mall name — feeds the
  // storefront win ticker. Public: amounts and mall names only, no buyer PII.
  // The winner email is masked (j***@howsu.local) so the ticker never leaks
  // a real contact to anonymous visitors.
  async recentWins(count = 5) {
    const prizes = await this.listMallPrizes(
      {},
      {
        take: count,
        order: { created_at: "DESC" },
        relations: ["mall"],
      }
    )
    return prizes.map((p) => ({
      id: p.id,
      mall_id: p.mall_id,
      mall_name: (p as any).mall?.name ?? "Mall",
      winner_buyer_email: maskEmail(p.winner_buyer_email),
      amount_ngn: Number(p.amount_ngn),
      won_at: p.created_at,
    }))
  }
}

// "j***@howsu.local" — first char + asterisks + domain. Handles malformed
// addresses defensively (no domain → mask the local part only).
function maskEmail(email: string): string {
  const [local, domain] = (email || "").split("@")
  if (!local) {
    return "***"
  }
  const head = local.slice(0, 1)
  const masked = `${head}${"*".repeat(Math.min(Math.max(local.length - 1, 0), 3))}`
  return domain ? `${masked}@${domain}` : masked
}

export default MallModuleService

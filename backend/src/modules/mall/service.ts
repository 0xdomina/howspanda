import { MedusaError, MedusaService } from "@medusajs/framework/utils"
import Mall from "./models/mall"
import MallSeller from "./models/mall-seller"
import MallBuyer from "./models/mall-buyer"
import MallPrize from "./models/mall-prize"

const DEFAULT_TARGET_SELLERS = 5
const DEFAULT_TARGET_BUYERS = 10
const MAX_MALL_DURATION_DAYS = 30

export type CreateMallInput = {
  name: string
  description?: string
  createdBySellerId: string
  targetSellers?: number
  targetBuyers?: number
  prizeWinnerCount: number
  prizeDistribution: "equal" | "random"
  prizePoolNgn: number
  durationDays?: number
}

export type JoinAsSellerInput = {
  mallId: string
  sellerId: string
  contributionNgn: number
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
    return await this.createMalls({
      name: input.name,
      description: input.description ?? null,
      created_by_seller_id: input.createdBySellerId,
      status: "pending",
      target_sellers: input.targetSellers ?? DEFAULT_TARGET_SELLERS,
      target_buyers: input.targetBuyers ?? DEFAULT_TARGET_BUYERS,
      prize_winner_count: input.prizeWinnerCount,
      prize_distribution: input.prizeDistribution,
      prize_pool_ngn: input.prizePoolNgn,
      contributed_ngn: 0,
      remaining_ngn: input.prizePoolNgn,
      expires_at: expiresAt,
    })
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

  async listActive() {
    return await this.listMalls(
      { status: "active" },
      { order: { created_at: "DESC" } }
    )
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
    return mall[0]
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
      redeemable_id: input.redeemableId ?? null,
      joined_at: new Date(),
    })
    const newContributed = mall[0].contributed_ngn + input.contributionNgn
    const newRemaining = mall[0].remaining_ngn + input.contributionNgn
    await this.updateMalls({
      id: input.mallId,
      contributed_ngn: newContributed,
      remaining_ngn: newRemaining,
      prize_pool_ngn: mall[0].prize_pool_ngn + input.contributionNgn,
    })
    await this.checkThresholds(input.mallId)
    return sellerJoin
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
    if (mall[0].status === "closed" || mall[0].status === "cancelled") {
      return mall[0]
    }
    if (mall[0].remaining_ngn > 0) {
      await this.refund(mallId)
    }
    const updated = await this.updateMalls({
      id: mallId,
      status: "expired",
    })
    return updated
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
    if (mall[0].status !== "pending") {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "Only pending malls can be cancelled"
      )
    }
    if (mall[0].contributed_ngn > 0) {
      await this.refund(mallId)
    }
    const updated = await this.updateMalls({
      id: mallId,
      status: "cancelled",
    })
    return updated
  }

  private async refund(mallId: string) {
    const mall = await this.listMalls(
      { id: mallId },
      { take: 1 }
    )
    if (!mall.length) return
    const sellers = await this.listMallSellers({
      mall_id: mallId,
    })
    if (sellers.length === 0) return
    const totalContributed = sellers.reduce(
      (sum, s) => sum + s.contribution_ngn,
      0
    )
    if (totalContributed === 0) return
    const remainingPool = mall[0].remaining_ngn
    for (const seller of sellers) {
      const share = seller.contribution_ngn / totalContributed
      const refundAmount = Math.floor(remainingPool * share)
      if (refundAmount > 0) {
        console.log(
          `[mall] Refunding ₦${refundAmount} to seller ${seller.seller_id} ` +
          `(share: ${(share * 100).toFixed(2)}%)`
        )
      }
    }
    await this.updateMalls({
      id: mallId,
      remaining_ngn: 0,
    })
  }
}

export default MallModuleService

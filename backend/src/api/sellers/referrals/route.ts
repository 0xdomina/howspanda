import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import {
  ContainerRegistrationKeys,
  MedusaError,
} from "@medusajs/framework/utils"
import { z } from "@medusajs/framework/zod"
import { GROWTH_MODULE } from "../../../modules/growth"
import GrowthModuleService from "../../../modules/growth/service"
import { MARKETPLACE_MODULE } from "../../../modules/marketplace"
import type MarketplaceModuleService from "../../../modules/marketplace/service"
import { PostReferralCreateSchema } from "../../middlewares"

type PostBody = z.infer<typeof PostReferralCreateSchema>

const envNumber = (name: string, fallback: number) => {
  const parsed = Number(process.env[name])
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback
}

async function resolveSellerId(
  req: AuthenticatedMedusaRequest
): Promise<string> {
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const { data: [sellerAdmin] } = await query.graph({
    entity: "seller_admin",
    fields: ["id", "seller.id"],
    filters: { id: [req.auth_context.actor_id] },
  })
  if (!sellerAdmin?.seller?.id) {
    throw new MedusaError(
      MedusaError.Types.UNAUTHORIZED,
      "Seller not found for authenticated actor"
    )
  }
  return sellerAdmin.seller.id
}

/**
 * Qualification on read (trust-score pattern): every `pending` referral whose
 * referee email now has an escrow-released (`available`) commission line gets
 * its reward written — once, idempotently. This is the roadmap's anti-fraud
 * gate: only completed transactions pay.
 */
export const GET = async (
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) => {
  const sellerId = await resolveSellerId(req)
  const growth = req.scope.resolve<GrowthModuleService>(GROWTH_MODULE)
  const marketplace =
    req.scope.resolve<MarketplaceModuleService>(MARKETPLACE_MODULE)
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)

  const reward = envNumber("REFERRAL_SELLER_REWARD_NGN", 2000)
  const cap = envNumber("REFERRAL_SELLER_LIFETIME_CAP_NGN", 1500000)

  let lifetimePaid = 0
  const qualified = await growth.listReferrals(
    { referrer_seller_id: sellerId, status: "qualified" },
    { take: null }
  )
  for (const q of qualified) {
    lifetimePaid += Number(q.reward_amount ?? 0)
  }

  const pending = await growth.listReferrals(
    { referrer_seller_id: sellerId, status: "pending" },
    { take: null }
  )
  for (const ref of pending) {
    if (!ref.referee_email) {
      continue
    }
    const { data: orders } = await query.graph({
      entity: "order",
      fields: ["id"],
      filters: { email: ref.referee_email },
    })
    for (const order of orders) {
      const lines = await marketplace.listCommissionLines({
        parent_order_id: order.id,
      })
      if (!lines.some((l) => l.status === "available")) {
        continue
      }
      if (lifetimePaid >= cap) {
        await growth.markQualified(ref.id, {
          rewardAmount: 0,
          cappedReason: `lifetime referral cap of ${cap} reached`,
        })
      } else {
        const line = await marketplace.createCommissionLines([
          {
            order_id: `ref:${ref.id}`,
            currency_code: "ngn",
            order_total: reward,
            rate: 0,
            commission_amount: 0,
            net_amount: reward,
            status: "available",
            available_at: new Date(),
            seller_id: sellerId,
          },
        ])
        await growth.markQualified(ref.id, {
          rewardAmount: reward,
          commissionLineId: line[0]?.id ?? null,
        })
        lifetimePaid += reward
      }
      // Campaign #1 hook: a qualified referral also scores the seller (and
      // issues the invitee's double-sided credit) on any live invite challenge.
      await growth.recordInviteQualified({
        sellerId,
        referralId: ref.id,
        refereeEmail: ref.referee_email,
      })
      break // first completed transaction qualifies the referral
    }
  }

  const referrals = await growth.listForSeller(sellerId)
  const stats = await growth.statsForSeller(sellerId)
  res.json({ referrals, stats })
}

// A seller invites a buyer by email — generates an unguessable share code.
export const POST = async (
  req: AuthenticatedMedusaRequest<PostBody>,
  res: MedusaResponse
) => {
  const sellerId = await resolveSellerId(req)
  const growth = req.scope.resolve<GrowthModuleService>(GROWTH_MODULE)
  const referral = await growth.createForSeller(
    sellerId,
    req.validatedBody.referee_email
  )
  res.status(201).json({ referral })
}

import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { MedusaError } from "@medusajs/framework/utils"
import { z } from "@medusajs/framework/zod"
import { GROWTH_MODULE } from "../../../../../modules/growth"
import GrowthModuleService from "../../../../../modules/growth/service"
import { MARKETPLACE_MODULE } from "../../../../../modules/marketplace"
import type MarketplaceModuleService from "../../../../../modules/marketplace/service"
import { resolveSellerId } from "../../../../../lib/sellers/resolve-seller"
import { PostChallengeClaimSchema } from "../../../../middlewares"

type PostBody = z.infer<typeof PostChallengeClaimSchema>

// Seller claims a challenge reward (milestone payouts). Paid through the same
// rails as referral rewards: an "available" marketplace commission line is
// created (settles with the next payout run) and the reward flips issued →
// claimed with the line id as its money reference.
export const POST = async (
  req: AuthenticatedMedusaRequest<PostBody>,
  res: MedusaResponse
) => {
  const sellerId = await resolveSellerId(req)
  const { slug } = req.params as { slug: string }
  const growth = req.scope.resolve<GrowthModuleService>(GROWTH_MODULE)
  const marketplace =
    req.scope.resolve<MarketplaceModuleService>(MARKETPLACE_MODULE)

  const reward = await growth.getRewardForParticipant(
    req.validatedBody.reward_id,
    { type: "seller", sellerId }
  )
  if (reward.challenge?.id !== slug && reward.challenge?.slug !== slug) {
    throw new MedusaError(
      MedusaError.Types.NOT_FOUND,
      "Reward not found for this challenge"
    )
  }
  if (reward.kind !== "seller_credit") {
    throw new MedusaError(
      MedusaError.Types.CONFLICT,
      "This reward is a buyer credit; claim it from the buyer wallet"
    )
  }
  if (reward.status === "voided") {
    throw new MedusaError(
      MedusaError.Types.CONFLICT,
      "This reward has been voided"
    )
  }
  if (reward.status === "claimed") {
    res.json({ reward })
    return
  }

  const line = await marketplace.createCommissionLines([
    {
      order_id: `challenge:${reward.id}`,
      currency_code: "ngn",
      order_total: Number(reward.amount),
      rate: 0,
      commission_amount: 0,
      net_amount: Number(reward.amount),
      status: "available",
      available_at: new Date(),
      seller_id: sellerId,
    },
  ])
  const { reward: claimed } = await growth.claimReward(
    reward.id,
    line[0]?.id ?? `challenge:${reward.id}`
  )
  res.json({ reward: claimed })
}

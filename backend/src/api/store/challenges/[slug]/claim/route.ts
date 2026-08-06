import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { MedusaError } from "@medusajs/framework/utils"
import { z } from "@medusajs/framework/zod"
import { GROWTH_MODULE } from "../../../../../modules/growth"
import GrowthModuleService from "../../../../../modules/growth/service"
import { BUYER_WALLET_MODULE } from "../../../../../modules/buyer-wallet"
import BuyerWalletModuleService from "../../../../../modules/buyer-wallet/service"
import { resolveCustomerEmail } from "../../../../../lib/escrow/resolve-customer-email"
import { PostChallengeClaimSchema } from "../../../../middlewares"

type PostBody = z.infer<typeof PostChallengeClaimSchema>

// Buyer claims a challenge reward. Money moves HERE and only here: the wallet is
// credited (ledger source "campaign", reference = reward id) and the reward
// flips issued → claimed with the ledger id as its money reference. Idempotent
// even if a prior claim flip failed after the credit landed.
export const POST = async (
  req: AuthenticatedMedusaRequest<PostBody>,
  res: MedusaResponse
) => {
  const email = await resolveCustomerEmail(req)
  const { slug } = req.params as { slug: string }
  const growth = req.scope.resolve<GrowthModuleService>(GROWTH_MODULE)
  const buyerWallet =
    req.scope.resolve<BuyerWalletModuleService>(BUYER_WALLET_MODULE)

  const reward = await growth.getRewardForParticipant(
    req.validatedBody.reward_id,
    { type: "buyer", buyerEmail: email }
  )
  if (reward.challenge?.id !== slug && reward.challenge?.slug !== slug) {
    throw new MedusaError(
      MedusaError.Types.NOT_FOUND,
      "Reward not found for this challenge"
    )
  }
  if (reward.kind !== "buyer_credit") {
    throw new MedusaError(
      MedusaError.Types.CONFLICT,
      "This reward is a seller credit; claim it from the seller dashboard"
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

  const ledger = await buyerWallet.listLedger(email)
  const already = ledger.find(
    (l) => l.source === "campaign" && l.reference === reward.id
  )
  const reference = already
    ? already.id
    : (
        await buyerWallet.credit({
          buyerEmail: email,
          amount: Number(reward.amount),
          source: "campaign",
          reference: reward.id,
        })
      ).ledger.id

  const { reward: claimed } = await growth.claimReward(reward.id, reference)
  res.json({ reward: claimed })
}

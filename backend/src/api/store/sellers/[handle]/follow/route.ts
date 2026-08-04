import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { FOLLOWS_MODULE } from "../../../../../modules/follows"
import FollowsModuleService from "../../../../../modules/follows/service"
import { resolveSellerByHandle } from "../../../../../lib/sellers/resolve-seller"

// Follow / unfollow a store. Buyer identity is count-only to the seller.
const customerId = (req: AuthenticatedMedusaRequest) =>
  req.auth_context.actor_id as string

export const POST = async (
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) => {
  const follows = req.scope.resolve<FollowsModuleService>(FOLLOWS_MODULE)
  const { id: sellerId } = await resolveSellerByHandle(req, req.params.handle)
  await follows.follow(sellerId, customerId(req))

  const follower_count = await follows.followerCount(sellerId)
  res.json({ followed: true, follower_count })
}

export const DELETE = async (
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) => {
  const follows = req.scope.resolve<FollowsModuleService>(FOLLOWS_MODULE)
  const { id: sellerId } = await resolveSellerByHandle(req, req.params.handle)
  await follows.unfollow(sellerId, customerId(req))

  const follower_count = await follows.followerCount(sellerId)
  res.json({ followed: false, follower_count })
}
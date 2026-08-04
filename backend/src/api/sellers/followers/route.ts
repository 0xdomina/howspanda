import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { FOLLOWS_MODULE } from "../../../modules/follows"
import FollowsModuleService from "../../../modules/follows/service"
import { resolveSellerId } from "../../../lib/sellers/resolve-seller"

// Store owner's follower dashboard. Count-only: how many people follow and
// the recent broadcast delivery/read rates — never who they are.
export const GET = async (
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) => {
  const sellerId = await resolveSellerId(req)
  const follows = req.scope.resolve<FollowsModuleService>(FOLLOWS_MODULE)

  const { broadcasts, remaining_this_week } =
    await follows.listBroadcasts(sellerId)
  const follower_count = await follows.followerCount(sellerId)

  res.json({
    follower_count,
    remaining_this_week,
    broadcasts: broadcasts.map((b) => ({
      id: b.id,
      type: b.type,
      title: b.title,
      created_at: b.created_at,
      delivered: b.delivered,
      read_count: b.read_count,
      giveaway_claims_count: b.giveaway_claims_count,
    })),
  })
}

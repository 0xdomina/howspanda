import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import {
  ContainerRegistrationKeys,
  MedusaError,
} from "@medusajs/framework/utils"
import { REDEEMABLES_MODULE } from "../../../../modules/redeemables"
import RedeemablesModuleService from "../../../../modules/redeemables/service"
import { FOLLOWS_MODULE } from "../../../../modules/follows"
import FollowsModuleService from "../../../../modules/follows/service"
import { getTrustScore } from "../../../../lib/reviews/trust-score"

// The seller's public front door: /store/<handle> renders this. Profile +
// published products + instruments listed FOR SALE (never their codes —
// codes are bearer instruments, bought or gifted, never read off a page) +
// public follower count + a preview of recent broadcasts (delivered in-app
// to followers only; the page just shows what the store has been posting).
export const GET = async (
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) => {
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const { data: [seller] } = await query.graph({
    entity: "seller",
    fields: [
      "id",
      "name",
      "handle",
      "logo",
      "description",
      "verification_status",
      "products.*",
    ],
    filters: { handle: req.params.handle },
  })
  if (!seller) {
    throw new MedusaError(MedusaError.Types.NOT_FOUND, "Store not found")
  }

  const redeemablesModule =
    req.scope.resolve<RedeemablesModuleService>(REDEEMABLES_MODULE)
  const active = await redeemablesModule.listRedeemables({
    seller_id: seller.id,
    status: "active",
    price: { $ne: null },
  })
  const now = Date.now()
  const forSale = active
    .filter((r) => !r.expires_at || new Date(r.expires_at).getTime() > now)
    .map(({ code: _code, seller_id: _sid, ...publicFields }) => publicFields)

  const trust = await getTrustScore(req.scope, seller.id)

  const follows =
    req.scope.resolve<FollowsModuleService>(FOLLOWS_MODULE)
  const viewer = req.auth_context?.actor_id as string | undefined
  const [follower_count, followed_by_viewer] = await Promise.all([
    follows.followerCount(seller.id),
    follows.isFollowing(seller.id, viewer ?? ""),
  ])
  const { broadcasts } = await follows.listBroadcasts(seller.id)

  res.json({
    seller: {
      name: seller.name,
      handle: seller.handle,
      logo: seller.logo,
      description: seller.description,
      verification_status: seller.verification_status,
    },
    follower_count,
    followed_by_viewer,
    products: (seller.products ?? [])
      .filter((p) => p?.status === "published")
      .map((p) => ({
        id: p!.id,
        title: p!.title,
        handle: p!.handle,
        thumbnail: p!.thumbnail ?? null,
      })),
    redeemables: forSale,
    trust,
    broadcasts: broadcasts.slice(0, 3).map((b) => ({
      id: b.id,
      type: b.type,
      title: b.title,
      body: b.body,
      created_at: b.created_at,
      giveaway_claims_count: b.giveaway_claims_count,
    })),
  })
}

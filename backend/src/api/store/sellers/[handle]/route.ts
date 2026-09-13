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
import { resolveSellerVerificationStatus } from "../../../../lib/sellers/verification-status"

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
      "cover_image",
      "description",
      "accent_color",
      "theme",
      "products.*",
      "products.variants.*",
      "products.variants.prices.*",
    ],
    filters: { handle: req.params.handle },
  })
  if (!seller) {
    throw new MedusaError(MedusaError.Types.NOT_FOUND, "Store not found")
  }

  // Derived from the seller's KYC identity state, never the stored column.
  const verification_status = await resolveSellerVerificationStatus(
    req.scope,
    seller.id
  )

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
    .map(({ code: _code, seller_id: _sid, ...publicFields }) => ({
      ...publicFields,
      product_handle:
        (seller.products ?? []).find((p) => p?.id === publicFields.product_id)
          ?.handle ?? null,
    }))

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
      cover_image: seller.cover_image,
      description: seller.description,
      accent_color: seller.accent_color,
      theme: seller.theme,
      verification_status,
    },
    follower_count,
    followed_by_viewer,
    products: (seller.products ?? [])
      .filter((p) => p?.status === "published")
      .map((p) => {
        // Cheapest variant price so the storefront can show a price without
        // a second pricing call. Amounts are in the price's currency minor
        // units, matching convertToLocale on the storefront.
        let price_amount: number | null = null
        let price_currency: string | null = null
        for (const v of (p as any)?.variants ?? []) {
          for (const price of v?.prices ?? []) {
            const amount = Number(price?.amount)
            if (!Number.isFinite(amount)) continue
            if (price_amount === null || amount < price_amount) {
              price_amount = amount
              price_currency = price?.currency_code ?? price_currency
            }
          }
        }
        return {
          id: p!.id,
          title: p!.title,
          handle: p!.handle,
          thumbnail: p!.thumbnail ?? null,
          price_amount,
          price_currency,
        }
      }),
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

import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import {
  ContainerRegistrationKeys,
  MedusaError,
} from "@medusajs/framework/utils"
import { REDEEMABLES_MODULE } from "../../../../modules/redeemables"
import RedeemablesModuleService from "../../../../modules/redeemables/service"
import { getTrustScore } from "../../../../lib/reviews/trust-score"

// The seller's public front door: /store/<handle> renders this. Profile +
// published products + instruments listed FOR SALE (never their codes —
// codes are bearer instruments, bought or gifted, never read off a page).
export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
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

  res.json({
    seller: {
      name: seller.name,
      handle: seller.handle,
      logo: seller.logo,
      description: seller.description,
      verification_status: seller.verification_status,
    },
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
  })
}

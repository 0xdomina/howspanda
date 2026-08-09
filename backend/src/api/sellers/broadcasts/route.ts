import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import {
  ContainerRegistrationKeys,
  MedusaError,
} from "@medusajs/framework/utils"
import { FOLLOWS_MODULE } from "../../../modules/follows"
import FollowsModuleService from "../../../modules/follows/service"
import { REDEEMABLES_MODULE } from "../../../modules/redeemables"
import RedeemablesModuleService from "../../../modules/redeemables/service"
import {
  requireSellerOwner,
  requireSellerPermission,
} from "../../../lib/sellers/resolve-seller"
import { PostBroadcastSchema } from "../../middlewares"
import { z } from "@medusajs/framework/zod"

type PostBroadcastBody = z.infer<typeof PostBroadcastSchema>

export const GET = async (
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) => {
  const context = await requireSellerPermission(req, "broadcasts")
  const sellerId = context.sellerId
  const follows = req.scope.resolve<FollowsModuleService>(FOLLOWS_MODULE)

  const result = await follows.listBroadcasts(sellerId)
  res.json(result)
}

export const POST = async (
  req: AuthenticatedMedusaRequest<PostBroadcastBody>,
  res: MedusaResponse
) => {
  const context = await requireSellerPermission(req, "broadcasts")
  const sellerId = context.sellerId
  const body = req.validatedBody
  const follows = req.scope.resolve<FollowsModuleService>(FOLLOWS_MODULE)

  // Snapshot the store's display name/handle so notification history stays
  // stable if the store is renamed later.
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const { data: [seller] } = await query.graph({
    entity: "seller",
    fields: ["name", "handle"],
    filters: { id: sellerId },
  })
  if (!seller) {
    throw new MedusaError(MedusaError.Types.NOT_FOUND, "Store not found")
  }

  let voucherCode: string | null = null
  let discountType: "fixed" | "percent" | null = null
  let discountValue: number | null = null
  if (body.type === "voucher" && body.voucher) {
    await requireSellerOwner(req)
    const redeemables =
      req.scope.resolve<RedeemablesModuleService>(REDEEMABLES_MODULE)
    const expires_at = body.voucher.expires_in_days
      ? new Date(Date.now() + body.voucher.expires_in_days * 86400000)
      : undefined
    const [voucher] = await redeemables.mintRedeemables({
      seller_id: sellerId,
      type: "voucher",
      title: body.title,
      discount_type: body.voucher.discount_type,
      discount_value: body.voucher.discount_value,
      expires_at,
    })
    voucherCode = voucher.code
    discountType = body.voucher.discount_type
    discountValue = body.voucher.discount_value
  }

  const result = await follows.createBroadcast({
    seller_id: sellerId,
    actor_label: seller.name,
    actor_handle: seller.handle,
    type: body.type,
    title: body.title,
    body: body.body,
    product_id: body.product_id ?? null,
    voucher_code: voucherCode,
    discount_type: discountType,
    discount_value: discountValue,
  })

  res.json(result)
}

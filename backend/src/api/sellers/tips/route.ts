import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import {
  ContainerRegistrationKeys,
  MedusaError,
} from "@medusajs/framework/utils"
import { z } from "@medusajs/framework/zod"
import { TIPPING_MODULE } from "../../../modules/tipping"
import TippingModuleService from "../../../modules/tipping/service"
import { MARKETPLACE_MODULE } from "../../../modules/marketplace"
import type MarketplaceModuleService from "../../../modules/marketplace/service"
import { REDEEMABLES_MODULE } from "../../../modules/redeemables"
import type RedeemablesModuleService from "../../../modules/redeemables/service"
import { PostSellerTipSchema } from "../../middlewares"

type PostBody = z.infer<typeof PostSellerTipSchema>

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

// Seller's tip ledger: everything given and received.
export const GET = async (
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) => {
  const sellerId = await resolveSellerId(req)
  const tipping: TippingModuleService = req.scope.resolve(TIPPING_MODULE)

  const tips = await tipping.listForSeller(sellerId)
  const summary = await tipping.summary(sellerId)

  res.json({ tips, summary })
}

// Seller → buyer thank-you (cash, extra product, or a gifted store code).
export const POST = async (
  req: AuthenticatedMedusaRequest<PostBody>,
  res: MedusaResponse
) => {
  const sellerId = await resolveSellerId(req)
  const body = req.validatedBody
  const tipping: TippingModuleService = req.scope.resolve(TIPPING_MODULE)
  const marketplace =
    req.scope.resolve<MarketplaceModuleService>(MARKETPLACE_MODULE)

  const isCash = Number.isFinite(body.amount) && (body.amount as number) > 0
  const isProduct = !isCash && (!!body.product_id || !!body.product_title)
  const isInstrument = !isCash && !isProduct && !!body.redeemable_code
  if (!isCash && !isProduct && !isInstrument) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "A seller tip needs a cash amount, an extra product, or a gifted store code"
    )
  }

  let commissionLineId: string | null = null
  if (isCash) {
    // a seller can only gift what they actually have available
    const balances = await marketplace.getSellerBalance(sellerId)
    const available = balances.ngn?.available ?? 0
    if ((body.amount as number) > available + 0.001) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "Seller available balance is insufficient for this tip"
      )
    }
    // negative ledger line: the cash flows OUT of the seller's balance
    const line = await marketplace.createCommissionLines([
      {
        order_id: `tip:${sellerId}:gift:${Date.now()}`,
        currency_code: "ngn",
        order_total: -Number(body.amount),
        rate: 0,
        commission_amount: 0,
        net_amount: -Number(body.amount),
        status: "available",
        available_at: new Date(),
        seller_id: sellerId,
      },
    ])
    commissionLineId = line[0]?.id ?? null
  }

  // Gifting one of the seller's own store instruments (gift card / voucher /
  // ticket): the code's value is addressed to the buyer — no cash moves. Foreign
  // or spent codes are invisible (404), matching the redeemables convention.
  let redeemableId: string | null = null
  let redeemableCode: string | null = null
  if (isInstrument) {
    const redeemables = req.scope.resolve<RedeemablesModuleService>(
      REDEEMABLES_MODULE
    )
    const [redeem] = await redeemables.listRedeemables({
      code: (body.redeemable_code as string).toUpperCase(),
    })
    if (
      !redeem ||
      redeem.seller_id !== sellerId ||
      redeem.status !== "active"
    ) {
      throw new MedusaError(
        MedusaError.Types.NOT_FOUND,
        "Code not found"
      )
    }
    await redeemables.updateRedeemables([
      { id: redeem.id, issued_to_email: body.buyer_email },
    ])
    redeemableId = redeem.id
    redeemableCode = redeem.code
  }

  const tip = await tipping.createTip({
    direction: "to_buyer",
    orderId: body.order_id,
    buyerEmail: body.buyer_email,
    sellerId,
    amount: isCash ? Number(body.amount) : null,
    productId: body.product_id,
    productTitle: body.product_title,
    redeemableId,
    redeemableCode,
    note: body.note,
    commissionLineId,
  })

  res.json({ tip })
}

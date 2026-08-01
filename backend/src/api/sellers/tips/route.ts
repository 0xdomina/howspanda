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

// Seller → buyer thank-you (cash or extra product).
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
  if (!isCash && !body.product_id && !body.product_title) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "A seller tip needs either a cash amount or an extra product"
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

  const tip = await tipping.createTip({
    direction: "to_buyer",
    orderId: body.order_id,
    buyerEmail: body.buyer_email,
    sellerId,
    amount: isCash ? Number(body.amount) : null,
    productId: body.product_id,
    productTitle: body.product_title,
    note: body.note,
    commissionLineId,
  })

  res.json({ tip })
}
